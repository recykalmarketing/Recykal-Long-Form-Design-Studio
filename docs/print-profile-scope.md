# Print PDF scope - v1.1.1

The current **Print PDF** profile intentionally includes only:

- CMYK conversion / print-oriented PDF post-processing
- embedded-font validation
- raster effective-resolution checks (blocking below 180 ppi; warning below 300 ppi)
- rendered visual preflight

The following production features are deliberately disabled for now:

- bleed
- TrimBox
- BleedBox
- crop/printer marks

Digital PDF remains RGB and screen-optimised.
