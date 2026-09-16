import io
import pathlib
import sys
import unittest

from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from ra_sc_gif_server import PRELUDE_SECONDS, classify, normalize, render_gif, _html_config


class GifTests(unittest.TestCase):
    def test_coc_ranks(self):
        self.assertEqual(classify(1, 60)[0], "crit")
        self.assertEqual(classify(32, 60)[0], "success")
        self.assertEqual(classify(100, 60)[0], "fumble")

    def test_gif_has_long_tail(self):
        image = Image.open(io.BytesIO(render_gif({"mode": "coc", "skill": "侦查", "target": 60, "result": 32})))
        durations = []
        for index in range(image.n_frames):
            image.seek(index)
            durations.append(int(image.info.get("duration", 0)))
        self.assertGreaterEqual(image.n_frames, 2)
        self.assertGreaterEqual(max(durations), 270000)
        self.assertGreaterEqual(sum(durations), 273000)

    def test_prelude_duration_is_exposed(self):
        self.assertAlmostEqual(PRELUDE_SECONDS, 3.4, places=2)

    def test_html_config_supports_styles_and_multi_dice(self):
        cfg = normalize({'mode': 'single', 'expression': '3d6', 'sides': 6, 'dice_count': 3, 'result': 10, 'style': 'slot'})
        html = _html_config(cfg)
        self.assertEqual(html['style'] if 'style' in html else cfg['style'], 'slot')
        self.assertEqual(len(html['diceList']), 3)
        self.assertEqual(html['diceList'][0]['sectors'], 6)

    def test_coc_bonus_penalty_layout(self):
        cfg = normalize({'mode': 'coc', 'target': 60, 'result': 32, 'bp': 'b2'})
        html = _html_config(cfg)
        self.assertEqual(len(html['diceList']), 4)  # 3 tens + units
        self.assertEqual(sum(1 for d in html['diceList'] if d.get('isDiscarded')), 2)


if __name__ == "__main__":
    unittest.main()
