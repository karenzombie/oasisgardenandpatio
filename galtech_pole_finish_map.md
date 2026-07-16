# Galtech Pole Picker: Model and Finish Data

Source: derived from the live Galtech umbrella variant wiring on dev (the same data
that drives the working umbrella finish selectors). Finish codes are the
`finishes.item_number` values. This is the authoritative model-to-finish map for
the BP and BH pole pickers.

## The two pole products the picker attaches to

| Product | SKU | id | Price |
|---|---|---|---|
| Bottom Pole | BP | 4966 | $60.00 |
| Bar Height Pole | BH | 4967 | $70.00 |

Both use the identical model and finish map below.

## Finish universe (13 Galtech finishes)

The finish CODE is always `finishes.item_number`. Never abbreviate a finish name
by hand (note Bronze is `MB`, not `BR`).

| finish_id | code | name |
|---|---|---|
| 259 | AB | Antique Bronze |
| 260 | AP | Antique Pewter |
| 261 | BK | Black |
| 262 | MB | Bronze |
| 263 | CH | Charcoal |
| 264 | DW | Dark Wood |
| 265 | DC | Deluxe Champagne |
| 266 | LT | Latte |
| 267 | LW | Light Wood |
| 268 | RC | Rib Champagne |
| 269 | SR | Silver |
| 270 | TK | Teak |
| 271 | W | White |

## Model to finish map (28 models, cantilevers 887/897/899 excluded)

Wood and teak models are IN scope (confirmed). Their finishes are the wood/teak
tones. Finish counts range from 1 to 8, so the finish step will sometimes have a
single option.

| model_sku | material | model name | available finishes (code=name) |
|---|---|---|---|
| 121 | wood | Cafe Wood 7.5' | DW=Dark Wood, LW=Light Wood |
| 131 | wood | All Purpose Wood Umbrella 9' | LW=Light Wood |
| 132 | wood | Double Pulley Wood Umbrella 9' | DW=Dark Wood, LW=Light Wood |
| 136 | wood | Commercial Wood Umbrella 9' | LW=Light Wood |
| 183 | wood | Quad Pulley Wood Umbrella 11' | LW=Light Wood |
| 532TK | teak | Designer Teak Umbrella 9' | TK=Teak |
| 537TK | teak | Rotational Tilt Teak Umbrella 9' | TK=Teak |
| 587TK | teak | Crank Lift Teak Umbrella 11' | TK=Teak |
| 636 | aluminum | Manual Tilt Umbrella 9' | MB=Bronze |
| 715 | aluminum | Commercial Use Umbrella 6' | AB=Antique Bronze |
| 722 | aluminum | Deluxe Commercial Use 7.5' | AB=Antique Bronze, BK=Black, SR=Silver |
| 725 | aluminum | Commercial Use 7.5' | AB=Antique Bronze, BK=Black, W=White |
| 727 | aluminum | Deluxe Auto Tilt 7.5' | AB=Antique Bronze, AP=Antique Pewter, BK=Black, DC=Deluxe Champagne, LT=Latte, RC=Rib Champagne, SR=Silver, W=White |
| 732 | aluminum | Deluxe Commercial Use Umbrella 9' | AB=Antique Bronze, BK=Black, SR=Silver |
| 735 | aluminum | Commercial Use Umbrella 9' | AB=Antique Bronze, BK=Black, W=White |
| 736 | aluminum | Standard Auto Tilt Umbrella 9' | BK=Black, CH=Charcoal, MB=Bronze, W=White |
| 737 | aluminum | Deluxe Auto Tilt Umbrella 9' | AB=Antique Bronze, AP=Antique Pewter, BK=Black, DC=Deluxe Champagne, LT=Latte, RC=Rib Champagne, SR=Silver, W=White |
| 762 | aluminum | Deluxe Commercial Use Square Umbrella 6'x6' | AB=Antique Bronze, SR=Silver |
| 772 | aluminum | Half Wall 3.5x7' | AB=Antique Bronze |
| 779 | aluminum | Deluxe Auto Tilt Oval Umbrella 8'x11' | AB=Antique Bronze, BK=Black |
| 781 | aluminum | Deluxe Commercial Use Flat Profile Umbrella 11' | SR=Silver |
| 782 | aluminum | Deluxe Commercial Use Square Umbrella 8'x8' | SR=Silver |
| 789 | aluminum | Deluxe Auto Tilt Umbrella 11' | AB=Antique Bronze, BK=Black |
| 791 | aluminum | Deluxe Commercial Use Umbrella 13' | SR=Silver |
| 792 | aluminum | Deluxe Commercial Use Umbrella 10'x10' | SR=Silver |
| 799 | aluminum | Deluxe Auto Tilt Umbrella 10'x10' | AB=Antique Bronze, BK=Black |
| 936 | aluminum | Auto Tilt with LED Lights Umbrella 9' | AB=Antique Bronze, BK=Black |
| 986 | aluminum | Auto Tilt with LED Lights Umbrella 11' | AB=Antique Bronze, BK=Black |

Machine-readable version: `galtech_pole_finish_map.csv`
(columns: model_sku, model_name, material, finish_code, finish_name; 61 rows).
