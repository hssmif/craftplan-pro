import sys
import unittest
from collections import Counter
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw

ENGINE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ENGINE_DIR))

from pipeline import AIDA_SENTINEL, ConvertOptions, convert_image_to_pattern  # noqa: E402


class BackgroundRemovalRegressionTest(unittest.TestCase):
    def test_white_background_is_empty_aida_not_stitched_symbols(self) -> None:
        img = Image.new("RGB", (400, 400), "white")
        draw = ImageDraw.Draw(img)
        draw.ellipse((170, 170, 230, 230), fill=(220, 40, 40))
        buf = BytesIO()
        img.save(buf, format="PNG")

        pattern = convert_image_to_pattern(
            buf.getvalue(),
            ConvertOptions(
                grid_size=130,
                max_colors=18,
                remove_background=True,
                cleanup_confetti=True,
            ),
        )

        total_cells = pattern["width"] * pattern["height"]
        stitched_cells = pattern["stitchedCells"]
        background_cells = pattern["backgroundCells"]

        self.assertEqual(pattern["totalCells"], total_cells)
        self.assertLess(stitched_cells, total_cells)
        self.assertEqual(pattern["totalStitches"], stitched_cells)
        self.assertEqual(background_cells, total_cells - stitched_cells)
        self.assertEqual(pattern["backgroundDmc"], AIDA_SENTINEL)
        self.assertIn(AIDA_SENTINEL, pattern["uniqueGridValues"])
        self.assertEqual(pattern["aidaCells"], background_cells)
        self.assertEqual(pattern["whiteDmcCells"], 0)
        self.assertTrue(all(count == 0 for count in pattern["whiteDmcCounts"].values()))
        self.assertEqual(pattern["first20UniqueGridValues"][0], AIDA_SENTINEL)

        flat = [cell for row in pattern["grid"] for cell in row]
        counts = Counter(flat)
        self.assertEqual(counts[AIDA_SENTINEL], background_cells)
        for white_code in ("White", "B5200", "3865", "3866", "BLANC"):
            self.assertEqual(counts[white_code], 0)
        self.assertEqual(sum(count for dmc, count in counts.items() if dmc != AIDA_SENTINEL), stitched_cells)

        symbol_by_dmc = {color["dmc"]: color["symbol"] for color in pattern["colors"]}
        self.assertNotIn(AIDA_SENTINEL, symbol_by_dmc)
        for cell in flat:
            if cell == AIDA_SENTINEL:
                self.assertIsNone(symbol_by_dmc.get(cell))


if __name__ == "__main__":
    unittest.main()
