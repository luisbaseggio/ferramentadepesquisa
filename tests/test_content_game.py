import tempfile
import unittest
from pathlib import Path

from content_game import (
    complete_cycle,
    initial_state,
    load_state,
    progress_ratio,
    restart_game,
    save_state,
    submit_step,
)


class ContentGameTests(unittest.TestCase):
    def test_step_progression_and_score(self):
        state = initial_state("Russinho", seed=1)

        submit_step(state, "idea", "Ideia original", seed=1)
        self.assertEqual(state.current_step, 1)
        self.assertEqual(state.score, 10)
        self.assertAlmostEqual(progress_ratio(state), 0.25)

        submit_step(state, "angle", "Angulo forte", seed=1)
        submit_step(state, "hook", "Gancho direto", seed=1)
        submit_step(state, "publish", "Publicar com CTA", seed=1)

        self.assertEqual(state.current_step, 0)
        self.assertEqual(state.streak, 1)
        self.assertEqual(state.cycle, 2)
        self.assertEqual(state.score, 125)
        self.assertEqual(len(state.history), 1)

    def test_invalid_order_raises(self):
        state = initial_state(seed=2)

        with self.assertRaises(ValueError):
            submit_step(state, "hook", "Pular etapa", seed=2)

    def test_restart_resets_progress(self):
        state = initial_state("Russinho", seed=3)
        submit_step(state, "idea", "Algo novo", seed=3)

        restarted = restart_game(creator_name=state.creator_name, seed=3)
        self.assertEqual(restarted.current_step, 0)
        self.assertEqual(restarted.score, 0)
        self.assertEqual(restarted.streak, 0)

    def test_save_and_load_round_trip(self):
        state = initial_state("Russinho", seed=4)
        submit_step(state, "idea", "Tema", seed=4)

        with tempfile.TemporaryDirectory() as tmp_dir:
            state_path = Path(tmp_dir) / "state.json"
            save_state(state, state_path)
            loaded = load_state(state_path)

        self.assertIsNotNone(loaded)
        self.assertEqual(loaded.creator_name, "Russinho")
        self.assertEqual(loaded.score, 10)
        self.assertEqual(loaded.current_entry["idea"], "Tema")

    def test_complete_cycle_awards_bonus(self):
        state = initial_state("Russinho", seed=5)
        state.current_entry = {
            "idea": "Ideia",
            "angle": "Angulo",
            "hook": "Hook",
            "publish": "CTA",
        }
        state.current_step = 4
        complete_cycle(state, seed=5)

        self.assertEqual(state.streak, 1)
        self.assertEqual(state.score, 50)
        self.assertEqual(state.cycle, 2)
        self.assertEqual(len(state.history), 1)


if __name__ == "__main__":
    unittest.main()
