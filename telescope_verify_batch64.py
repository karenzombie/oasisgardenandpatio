#!/usr/bin/env python3
"""
telescope_verify_batch64.py -- READ-ONLY independent verification of batch64's commit.

Checks:
  1. All 57 ASSIGN ids now have the expected sku/name/slug.
  2. All 7 deleted ids return zero rows (truly gone, not just is_active=false).
No writes. No COMMIT flag needed.
"""
import os, sys, psycopg2

EXPECTED_ASSIGN = [
    (3906, '5W80', 'Wexler End Table', 'wexler-end-table'),
    (3907, '5W90', 'Wexler Coffee Table', 'wexler-coffee-table'),
    (3517, 'ADA0PLG', 'Furniture Accessories Tall Leg Plugs for ADA Compliance (set of 4)', 'furniture-accessories-tall-leg-plugs-for-ada-compliance-set-of-4'),
    (3536, '9KV0', 'Kendall Add-on Arm Kit', 'kendall-add-on-arm-kit'),
    (3450, 'B0E0', 'Belle Isle Cafe Armless Chair w/ Polymer Accents', 'belle-isle-cafe-armless-chair-w-polymer-accents'),
    (3426, '7A60', 'Aruba Swivel Rocker', 'aruba-swivel-rocker'),
    (3416, '5A30', 'Aruba Armless Balcony Height Cafe Chair', 'aruba-armless-balcony-height-cafe-chair'),
    (3417, '7A80', 'Aruba Balcony Height Swivel Cafe Chair', 'aruba-balcony-height-swivel-cafe-chair'),
    (3418, '5A40', 'Aruba Armless Bar Height Cafe Chair', 'aruba-armless-bar-height-cafe-chair'),
    (3419, '7A90', 'Aruba Bar Height Swivel Cafe Chair', 'aruba-bar-height-swivel-cafe-chair'),
    (3420, '5A10', 'Aruba Armless Dining Height Cafe Chair', 'aruba-armless-dining-height-cafe-chair'),
    (3443, 'Z0S0', 'Bazza Contour Armless Chaise w/ Polymer Overlay', 'bazza-contour-armless-chaise-w-polymer-overlay'),
    (3421, '5790', 'Aruba Four Position High Bed Stacking Lay Flat Chaise', 'aruba-four-position-high-bed-stacking-lay-flat-chaise'),
    (3526, '7L30', 'Gardenella Four Position Stacking Armless Lay Flat Chaise', 'gardenella-four-position-stacking-armless-lay-flat-chaise'),
    (3527, '7720', 'Gardenella Four Position Stacking Chaise', 'gardenella-four-position-stacking-chaise'),
    (3582, 'LCT0', 'Leeward Furniture Clip', 'leeward-furniture-clip'),
    (3583, '8610', 'Leeward Hidden Motion Arm Chair w/ MGP Arms', 'leeward-hidden-motion-arm-chair-w-mgp-arms'),
    (3584, 'J010', 'Leeward Hidden Motion Arm Chair w/ Rustic Arms', 'leeward-hidden-motion-arm-chair-w-rustic-arms'),
    (3464, 'L030', 'Belle Isle Hidden Motion Chat Height Chair w/ Polymer Arms', 'belle-isle-hidden-motion-chat-height-chair-w-polymer-arms'),
    (3586, 'J040', 'Leeward Hidden Motion Loveseat w/ Rustic Arms', 'leeward-hidden-motion-loveseat-w-rustic-arms'),
    (3521, 'LPLW', 'Furniture Accessories Lumbar Pillow 12"x 24"', 'furniture-accessories-lumbar-pillow-12x-24'),
    (3589, '80V0', 'Leeward Arm Kit for Armless Chaise', 'leeward-arm-kit-for-armless-chaise'),
    (3453, 'B0J0', 'Belle Isle Single-Seat Glider w/ Polymer Accents', 'belle-isle-single-seat-glider-w-polymer-accents'),
    (3466, 'L0J0', 'Belle Isle Single Seat Glider w/ Polymer Arms', 'belle-isle-single-seat-glider-w-polymer-arms'),
    (3523, 'SPRDBR3', 'Furniture Accessories Spreader Bar Tool for Replacing Slings', 'furniture-accessories-spreader-bar-tool-for-replacing-slings'),
    (3422, '7A70', 'Aruba Stacking Arm Chair', 'aruba-stacking-arm-chair'),
    (3528, '7670', 'Gardenella Stacking Arm Chair', 'gardenella-stacking-arm-chair'),
    (3529, '8L60', 'Gardenella Stacking Bistro Chair', 'gardenella-stacking-bistro-chair'),
    (3423, '7A10', 'Aruba Stacking Cafe Chair', 'aruba-stacking-cafe-chair'),
    (3530, '7610', 'Gardenella Stacking Poolside Chair', 'gardenella-stacking-poolside-chair'),
    (3875, 'SS80', 'Soho Two-Seat Loveseat', 'soho-two-seat-loveseat'),
    (3595, '86A0', 'Leeward Supreme Hidden Motion Arm Chair w/ MGP Arms', 'leeward-supreme-hidden-motion-arm-chair-w-mgp-arms'),
    (3596, 'J0A0', 'Leeward Supreme Hidden Motion Arm Chair w/ Rustic Arms', 'leeward-supreme-hidden-motion-arm-chair-w-rustic-arms'),
    (3598, 'J0K0', 'Leeward Supreme Hidden Motion Loveseat w/ Rustic Arms', 'leeward-supreme-hidden-motion-loveseat-w-rustic-arms'),
    (3455, 'B0W0', 'Belle Isle Supreme Single-Seat Glider w/ Polymer Accents', 'belle-isle-supreme-single-seat-glider-w-polymer-accents'),
    (3468, 'L0W0', 'Belle Isle Supreme Single Seat Glider w/ Polymer Arms', 'belle-isle-supreme-single-seat-glider-w-polymer-arms'),
    (3424, '7A00', 'Aruba Supreme Stacking Arm Chair', 'aruba-supreme-stacking-arm-chair'),
    (3599, '86J0', 'Leeward Supreme Swivel Hidden Rocker w/ MGP Arms', 'leeward-supreme-swivel-hidden-rocker-w-mgp-arms'),
    (3600, 'J0J0', 'Leeward Supreme Swivel Hidden Rocker w/ Rustic Arms', 'leeward-supreme-swivel-hidden-rocker-w-rustic-arms'),
    (3425, '7A50', 'Aruba Supreme Swivel Rocker', 'aruba-supreme-swivel-rocker'),
    (3456, 'B080', 'Belle Isle Supreme Swivel Rocker w/ Polymer Accents', 'belle-isle-supreme-swivel-rocker-w-polymer-accents'),
    (3469, 'L050', 'Belle Isle Supreme Swivel Rocker w/ Polymer Arms', 'belle-isle-supreme-swivel-rocker-w-polymer-arms'),
    (3602, 'J0Q0', 'Leeward Supreme Three-Seat Sofa w/ Rustic Arms', 'leeward-supreme-three-seat-sofa-w-rustic-arms'),
    (3603, '8690', 'Leeward Swivel Hidden Rocker w/ MGP Arms', 'leeward-swivel-hidden-rocker-w-mgp-arms'),
    (3604, 'J090', 'Leeward Swivel Hidden Rocker w/ Rustic Arms', 'leeward-swivel-hidden-rocker-w-rustic-arms'),
    (3458, 'B090', 'Belle Isle Three-Seat Sofa w/ Polymer Accents', 'belle-isle-three-seat-sofa-w-polymer-accents'),
    (3471, 'L090', 'Belle Isle Three-Seat Sofa w/ Polymer Arms', 'belle-isle-three-seat-sofa-w-polymer-arms'),
    (3551, 'Q050', 'Larssen Three-Seat Sofa w/ Polymer Accents', 'larssen-three-seat-sofa-w-polymer-accents'),
    (3607, 'J030', 'Leeward Three-Seat Sofa w/ Rustic Arms', 'leeward-three-seat-sofa-w-rustic-arms'),
    (3459, 'B040', 'Belle Isle Two-Seat Glider w/ Polymer Accents', 'belle-isle-two-seat-glider-w-polymer-accents'),
    (3472, 'L080', 'Belle Isle Two-Seat Glider w/ Polymer Arms', 'belle-isle-two-seat-glider-w-polymer-arms'),
    (3553, 'Q040', 'Larssen Two-Seat Loveseat w/ Polymer Accents', 'larssen-two-seat-loveseat-w-polymer-accents'),
    (3460, 'L070', 'Belle Isle Arm Chair w/ Polymer Arms', 'belle-isle-arm-chair-w-polymer-arms'),
    (3470, 'L060', 'Belle Isle Swivel Rocker w/ Polymer Arms', 'belle-isle-swivel-rocker-w-polymer-arms'),
    (3547, 'Q070', 'Larssen Arm Chair w/ Polymer Accents', 'larssen-arm-chair-w-polymer-accents'),
    (3549, 'Q030', 'Larssen Swivel Rocker w/ Polymer Accents', 'larssen-swivel-rocker-w-polymer-accents'),
    (3415, 'EM40', 'Antero Two-Seat Loveseat', 'antero-two-seat-loveseat'),
]
DELETED_IDS = [3525, 3531, 3777, 3780, 3534, 3436, 3897]

def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL not set."); sys.exit(1)
    if "neon" in url.lower():
        print("PROD. Dev-only. Aborting."); sys.exit(1)
    conn = psycopg2.connect(url); cur = conn.cursor()

    aids = [r[0] for r in EXPECTED_ASSIGN]
    cur.execute("SELECT id, sku, name, slug FROM products WHERE id=ANY(%s);", (aids,))
    got = {r[0]: r for r in cur.fetchall()}

    mismatches = []
    missing = []
    for pid, esku, ename, eslug in EXPECTED_ASSIGN:
        row = got.get(pid)
        if row is None:
            missing.append(pid)
            continue
        _, sku, name, slug = row
        if sku != esku or name != ename or slug != eslug:
            mismatches.append((pid, (sku, name, slug), (esku, ename, eslug)))

    cur.execute("SELECT id FROM products WHERE id=ANY(%s);", (DELETED_IDS,))
    still_present = [r[0] for r in cur.fetchall()]

    print(f"Checked {len(EXPECTED_ASSIGN)} assigned products.")
    if missing:
        print(f"  MISSING (expected to exist, not found): {missing}")
    if mismatches:
        print(f"  MISMATCHES ({len(mismatches)}):")
        for pid, actual, expected in mismatches:
            print(f"    id {pid}: db={actual} expected={expected}")
    if not missing and not mismatches:
        print("  All 57 match expected sku/name/slug.")

    print(f"\nChecked {len(DELETED_IDS)} deleted ids.")
    if still_present:
        print(f"  STILL PRESENT (should be gone): {still_present}")
    else:
        print("  All 7 confirmed gone.")

    cur.close(); conn.close()

if __name__ == "__main__":
    main()
