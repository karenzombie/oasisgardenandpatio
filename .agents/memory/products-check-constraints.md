---
name: products CHECK constraint enums
description: Allowed values for products umbrella/pole CHECK constraints, and how to handle spec values outside them.
---

The `products` table enforces CHECK constraints with fixed enum value sets:

- `products_pole_material_check`: {Aluminum, Fiberglass, Wood, Teak, Steel}
- `products_umbrella_type_check`: {Cantilever, Market, Specialty, Beach}
- `products_umbrella_shape_check`: {Octagon, Square, Rectangle, Round}
- `products_lift_mechanism_check`: {Crank, Manual, Pulley, Quad Pulley}

A loader INSERT/UPDATE fails hard if a spec uses a value outside these sets (e.g. Frankford specs used pole "Ash Wood" and umbrella type "Cabana").

**Why:** specs frequently name materials/types more granularly than the constrained column allows.

**How to apply:** never silently remap — this violates the verbatim-load rule. Ask the user. Resolution pattern used for Frankford: map the constrained column to the nearest allowed value (Ash Wood→Wood, Cabana→Specialty) and preserve the original/granular value elsewhere (e.g. `sub_category`="Cabana", or a dedicated finish). Granular finish material can be expressed as a frame *finish* row instead of in pole_material.
