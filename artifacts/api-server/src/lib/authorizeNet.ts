import { logger } from "./logger";

export interface AuthnetRefundResult {
  success: boolean;
  refTransId?: string;
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
