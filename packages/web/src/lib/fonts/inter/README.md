# Inter

Minimize the font size, by only keeping font weights 400-900.

Made with [fonttools](https://github.com/fonttools/fonttools) (`pip install fonttools brotli`)

```python
import glob, io
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

FEATURES = ["calt", "ccmp", "locl", "kern", "mark", "mkmk", "case", "liga", "rlig", "dlig"]
for path in glob.glob("inter-*.woff2"):
    font = TTFont(path)
    chars = list(font.getBestCmap())
    font = instancer.instantiateVariableFont(font, {"wght": (400, 900)})
    buffer = io.BytesIO()
    font.flavor = None
    font.save(buffer)
    font = TTFont(buffer)
    options = subset.Options(layout_features=FEATURES, glyph_names=False, notdef_outline=True,
                             name_IDs=["*"])
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=chars)
    subsetter.subset(font)
    font.flavor = "woff2"
    font.save(path)
```
