import { logger } from "./logger";

export interface AuthnetRefundResult {
  success: boolean;
  refTransId?: string;
  errorMessage?: string;
  notConfigured?: boolean;
}

export interface AuthnetChargeResult {
  success: boolean;
  heldForReview?: true;
  transId?: string;
  avsResponse?: string;
  cvvResponse?: string;
  cardLast4?: string;
  cardType?: string;
  rawResponse?: unknown;
  errorMessage?: string;
  notConfigured?: boolean;
}

function getConfig(): {
  apiLoginId: string;
  transactionKey: string;
  sandbox: boolean;
} | null {
  const apiLoginId = process.env["AUTHNET_API_LOGIN_ID"];
  const transactionKey = process.env["AUTHNET_TRANSACTION_KEY"];
  if (!apiLoginId || !transactionKey) return null;
  const sandbox = process.env["AUTHNET_SANDBOX"] !== "false";
  return { apiLoginId, transactionKey, sandbox };
}

/**
 * Charge a card via Authorize.net Accept.js opaque token (authCaptureTransaction).
 *
 * Requires AUTHNET_API_LOGIN_ID and AUTHNET_TRANSACTION_KEY env vars.
 * Set AUTHNET_SANDBOX=false for production (defaults to sandbox / apitest endpoint).
 *
 * @param amountCents - Server-computed charge amount in integer cents. Converted
 *   to a dollar string internally (e.g. 4900 → "49.00"). Never accept a
 *   client-supplied amount.
 * @param dataDescriptor - Accept.js opaque token descriptor (never logged).
 * @param dataValue - Accept.js opaque token value (never logged).
 * @param orderNumber - Used as the gateway invoice number reference.
 * @param customerEmail - Forwarded to the gateway for receipt / AVS.
 *
 * Returns { success: true, transId, ... } on approval (responseCode "1") or
 * { success: false, errorMessage } on decline / network error. Never throws.
 */
export async function processAuthnetCharge(params: {
  amountCents: number;
  dataDescriptor: string;
  dataValue: string;
  orderNumber: string;
  customerEmail: string;
  signal?: AbortSignal;
}): Promise<AuthnetChargeResult> {
  const config = getConfig();
  if (!config) {
    logger.warn("Authorize.net not configured; skipping payment charge");
    return {
      success: false,
      notConfigured: true,
      errorMessage:
        "Authorize.net credentials not configured (AUTHNET_API_LOGIN_ID / AUTHNET_TRANSACTION_KEY)",
    };
  }

  const endpoint = config.sandbox
    ? "https://apitest.authorize.net/xml/v1/request.api"
    : "https://api.authorize.net/xml/v1/request.api";

  // Convert integer cents to dollar string. Do NOT send cents as dollars
  // (that would overcharge by 100×).
  const amountDollars = (params.amountCents / 100).toFixed(2);

  const payload = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: config.apiLoginId,
        transactionKey: config.transactionKey,
      },
      refId: params.orderNumber,
      transactionRequest: {
        transactionType: "authCaptureTransaction",
        amount: amountDollars,
        payment: {
          opaqueData: {
            dataDescriptor: params.dataDescriptor,
            dataValue: params.dataValue,
          },
        },
        order: {
          invoiceNumber: params.orderNumber,
        },
        customer: {
          email: params.customerEmail,
        },
      },
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: params.signal,
    });

    const text = await response.text();
    const json = JSON.parse(text.replace(/^\uFEFF/, "")) as {
      transactionResponse?: {
        responseCode?: string;
        transId?: string;
        avsResultCode?: string;
        cvvResultCode?: string;
        accountNumber?: string;
        accountType?: string;
        errors?: Array<{ errorCode: string; errorText: string }>;
        messages?: Array<{ code: string; description: string }>;
      };
      messages?: {
        resultCode?: string;
        message?: Array<{ code: string; text: string }>;
      };
    };

    const txn = json.transactionResponse;

    if (txn?.responseCode === "1") {
      // Strip leading mask characters from accountNumber (e.g. "XXXX1234" → "1234")
      const last4 = txn.accountNumber?.replace(/^X+/, "") ?? undefined;
      logger.info(
        {
          orderNumber: params.orderNumber,
          transId: txn.transId,
          cardLast4: last4,
          cardType: txn.accountType,
          amountDollars,
        },
        "Authorize.net charge approved",
      );
      return {
        success: true,
        transId: txn.transId,
        avsResponse: txn.avsResultCode,
        cvvResponse: txn.cvvResultCode,
        cardLast4: last4,
        cardType: txn.accountType,
        rawResponse: json,
      };
    }

    if (txn?.responseCode === "4") {
      // Held for review — the gateway accepted the transaction but flagged it
      // for manual review. Money may be captured. The checkout route creates an
      // order with payment status='pending' and does not zero the balance.
      const last4 = txn.accountNumber?.replace(/^X+/, "") ?? undefined;
      logger.info(
        {
          orderNumber: params.orderNumber,
          transId: txn.transId,
          cardLast4: last4,
          cardType: txn.accountType,
          amountDollars,
        },
        "Authorize.net charge held for review (responseCode 4)",
      );
      return {
        success: false,
        heldForReview: true,
        transId: txn.transId,
        avsResponse: txn.avsResultCode,
        cvvResponse: txn.cvvResultCode,
        cardLast4: last4,
        cardType: txn.accountType,
        rawResponse: json,
      };
    }

    const errorMsg =
      txn?.errors?.[0]?.errorText ??
      json.messages?.message?.[0]?.text ??
      "Your card was not approved. Please try a different card or contact your bank.";

    logger.warn(
      {
        orderNumber: params.orderNumber,
        amountDollars,
        responseCode: txn?.responseCode,
        errorCode: txn?.errors?.[0]?.errorCode,
        errorText: txn?.errors?.[0]?.errorText,
        // Do not log dataDescriptor/dataValue — opaque token is sensitive
      },
      "Authorize.net charge declined",
    );
    return {
      success: false,
      errorMessage: errorMsg,
      rawResponse: json,
    };
  } catch (err) {
    logger.error(
      {
        err,
        orderNumber: params.orderNumber,
        amountDollars,
        // Do not log dataDescriptor/dataValue
      },
      "Authorize.net charge request failed",
    );
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : "Network error contacting payment gateway",
    };
  }
}

/**
 * Process a credit-card refund through Authorize.net.
 *
 * Requires AUTHNET_API_LOGIN_ID and AUTHNET_TRANSACTION_KEY env vars.
 * Set AUTHNET_SANDBOX=false for production (defaults to sandbox mode).
 *
 * Returns { success: true, refTransId } on approval or
 * { success: false, errorMessage } on decline / misconfiguration.
 */
export async function processAuthnetRefund(params: {
  originalTransactionId: string;
  cardLast4: string;
  amount: number;
}): Promise<AuthnetRefundResult> {
  const config = getConfig();
  if (!config) {
    logger.warn("Authorize.net not configured; skipping payment refund");
    return {
      success: false,
      notConfigured: true,
      errorMessage:
        "Authorize.net credentials not configured (AUTHNET_API_LOGIN_ID / AUTHNET_TRANSACTION_KEY)",
    };
  }

  const endpoint = config.sandbox
    ? "https://apitest.authorize.net/xml/v1/request.api"
    : "https://api.authorize.net/xml/v1/request.api";

  const payload = {
    createTransactionRequest: {
      merchantAuthentication: {
        name: config.apiLoginId,
        transactionKey: config.transactionKey,
      },
      transactionRequest: {
        transactionType: "refundTransaction",
        amount: params.amount.toFixed(2),
        payment: {
          creditCard: {
            cardNumber: params.cardLast4,
            expirationDate: "XXXX",
          },
        },
        refTransId: params.originalTransactionId,
      },
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    const json = JSON.parse(text.replace(/^\uFEFF/, "")) as {
      transactionResponse?: {
        responseCode?: string;
        transId?: string;
        errors?: Array<{ errorCode: string; errorText: string }>;
      };
      messages?: {
        resultCode?: string;
        message?: Array<{ code: string; text: string }>;
      };
    };

    const txn = json.transactionResponse;
    if (txn?.responseCode === "1") {
      return { success: true, refTransId: txn.transId };
    }

    const errorMsg =
      txn?.errors?.[0]?.errorText ??
      json.messages?.message?.[0]?.text ??
      "Unknown Authorize.net error";
    logger.error(
      { params: { ...params, cardLast4: "****" }, json },
      "Authorize.net refund declined",
    );
    return { success: false, errorMessage: errorMsg };
  } catch (err) {
    logger.error(
      { err, params: { ...params, cardLast4: "****" } },
      "Authorize.net request failed",
    );
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : "Network error",
    };
  }
}
