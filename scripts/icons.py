from PIL import Image, ImageDraw
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'static'
for size in (192, 512):
    image = Image.new('RGB', (size, size), '#f4f6f2')
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill='#123b38')
    unit = size / 512
    def rect(box):
        draw.rectangle(tuple(round(v * unit) for v in box), fill='#d4f6df')
    rect((106, 140, 189, 372))
    rect((323, 140, 406, 372))
    rect((189, 227, 323, 299))
    image.save(root / f'icon-{size}.png', optimize=True)
