#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from random import Random
from typing import Dict, List, Optional


DEFAULT_STATE_PATH = Path("output/content_game_state.json")
STEP_DEFINITIONS = (
    ("idea", "Capturar uma ideia bruta"),
    ("angle", "Definir o angulo da mensagem"),
    ("hook", "Escrever um gancho forte"),
    ("publish", "Fechar com CTA e publicar"),
)
ACTION_REWARDS = {
    "idea": 10,
    "angle": 15,
    "hook": 20,
    "publish": 30,
}
BONUS_MESSAGES = (
    "Sua voz ficou mais nitida.",
    "Isso tem cara de conteudo com assinatura propria.",
    "Consistencia vence inspiracao solta.",
    "Voce transformou intuicao em direcao.",
)
MISSIONS = (
    "Poste algo que provoque conversa.",
    "Traga uma opiniao que so voce poderia defender.",
    "Resuma uma ideia complexa em linguagem simples.",
    "Construa autoridade sem perder humanidade.",
)


@dataclass(frozen=True)
class StepDefinition:
    key: str
    label: str


@dataclass
class GameState:
    creator_name: str = "Criador"
    score: int = 0
    streak: int = 0
    cycle: int = 1
    current_step: int = 0
    mission: str = MISSIONS[0]
    completed_steps: List[str] = field(default_factory=list)
    last_message: str = "Sua jornada comeca ao transformar intuicao em conteudo."
    current_entry: Dict[str, str] = field(
        default_factory=lambda: {"idea": "", "angle": "", "hook": "", "publish": ""}
    )
    history: List[Dict[str, str]] = field(default_factory=list)


def step_definitions() -> List[StepDefinition]:
    return [StepDefinition(key=key, label=label) for key, label in STEP_DEFINITIONS]


def initial_state(creator_name: str = "Criador", seed: int = 0) -> GameState:
    rng = Random(seed)
    return GameState(creator_name=creator_name, mission=rng.choice(MISSIONS))


def next_bonus_message(state: GameState, seed: int = 0) -> str:
    rng = Random(seed + state.score + state.current_step + state.cycle)
    return rng.choice(BONUS_MESSAGES)


def expected_step(state: GameState) -> StepDefinition:
    return step_definitions()[state.current_step]


def progress_ratio(state: GameState) -> float:
    return state.current_step / len(STEP_DEFINITIONS)


def can_submit(state: GameState, step_key: str, content: str) -> bool:
    return expected_step(state).key == step_key and bool(content.strip())


def expected_step_after_submit(step_key: str) -> str:
    if step_key == "idea":
        return "Ideia capturada."
    if step_key == "angle":
        return "Angulo definido."
    if step_key == "hook":
        return "Gancho travado."
    return "Publicacao concluida."


def complete_cycle(state: GameState, seed: int = 0) -> None:
    state.streak += 1
    state.score += 50
    state.history.append(
        {
            "cycle": str(state.cycle),
            "idea": state.current_entry["idea"],
            "angle": state.current_entry["angle"],
            "hook": state.current_entry["hook"],
            "publish": state.current_entry["publish"],
        }
    )
    state.cycle += 1
    state.current_step = 0
    state.completed_steps = []
    state.last_message = (
        "Ciclo fechado. "
        f"Voce entrou no ciclo {state.cycle} com {state.streak} publicacoes completas. "
        f"{next_bonus_message(state, seed)}"
    )
    state.current_entry = {"idea": "", "angle": "", "hook": "", "publish": ""}
    rng = Random(seed + state.cycle + state.streak)
    state.mission = rng.choice(MISSIONS)


def submit_step(state: GameState, step_key: str, content: str, seed: int = 0) -> GameState:
    if not can_submit(state, step_key, content):
        raise ValueError("Acao invalida para o momento atual do loop.")

    state.current_entry[step_key] = content.strip()
    state.completed_steps.append(step_key)
    state.score += ACTION_REWARDS[step_key]
    state.last_message = f"{expected_step_after_submit(step_key)} {next_bonus_message(state, seed)}"
    state.current_step += 1

    if state.current_step >= len(STEP_DEFINITIONS):
        complete_cycle(state, seed)

    return state


def restart_game(creator_name: str = "Criador", seed: int = 0) -> GameState:
    return initial_state(creator_name=creator_name, seed=seed)


def save_state(state: GameState, path: Path = DEFAULT_STATE_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(state), indent=2), encoding="utf-8")


def load_state(path: Path = DEFAULT_STATE_PATH) -> Optional[GameState]:
    if not path.exists():
        return None
    payload = json.loads(path.read_text(encoding="utf-8"))
    return GameState(**payload)


def status_lines(state: GameState) -> List[str]:
    current = expected_step(state)
    percent = int(progress_ratio(state) * 100)
    return [
        f"Criador: {state.creator_name}",
        f"Ciclo: {state.cycle}",
        f"Score: {state.score}",
        f"Streak: {state.streak}",
        f"Missao atual: {state.mission}",
        f"Proximo passo: {current.label}",
        f"Progresso do ciclo: {percent}%",
        f"Feedback: {state.last_message}",
    ]


def render_status(state: GameState) -> str:
    return "\n".join(status_lines(state))


def run_demo(name: str = "Russinho", seed: int = 7) -> str:
    state = initial_state(creator_name=name, seed=seed)
    submit_step(state, "idea", "Tema: bastidores de uma ideia que virou posicionamento", seed)
    submit_step(state, "angle", "Mostrar como opiniao forte nasce de observacao simples", seed)
    submit_step(state, "hook", "Ninguem cresce criando conteudo morno", seed)
    submit_step(state, "publish", "Post com CTA pedindo a visao da audiencia", seed)
    save_state(state)
    history = state.history[-1]
    lines = [
        "Demo do loop gamificado",
        "------------------------",
        render_status(state),
        "",
        "Ultimo conteudo fechado:",
        f"- Ideia: {history['idea']}",
        f"- Angulo: {history['angle']}",
        f"- Hook: {history['hook']}",
        f"- Fechamento: {history['publish']}",
    ]
    return "\n".join(lines)


def interactive_loop(state: GameState, state_path: Path, seed: int = 0) -> None:
    print("Modo interativo: digite seu conteudo em cada etapa.")
    print("Comandos especiais: /status, /restart, /save, /exit")

    while True:
        print()
        print(render_status(state))
        current = expected_step(state)
        user_input = input(f"\n{current.label}: ").strip()

        if user_input == "/exit":
            save_state(state, state_path)
            print("Estado salvo. Ate a proxima sessao.")
            return

        if user_input == "/status":
            continue

        if user_input == "/restart":
            state = restart_game(creator_name=state.creator_name, seed=seed)
            print("Jogo reiniciado.")
            continue

        if user_input == "/save":
            save_state(state, state_path)
            print(f"Estado salvo em {state_path}.")
            continue

        try:
            submit_step(state, current.key, user_input, seed)
        except ValueError as error:
            print(str(error))
            continue

        save_state(state, state_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Loop gamificado para transformar ideias em conteudo com consistencia."
    )
    parser.add_argument("--demo", action="store_true", help="Roda um ciclo completo de demonstracao.")
    parser.add_argument("--status", action="store_true", help="Mostra o estado salvo atual.")
    parser.add_argument("--restart", action="store_true", help="Reinicia o estado salvo.")
    parser.add_argument("--name", default="Criador", help="Nome exibido na experiencia.")
    parser.add_argument("--state-path", default=str(DEFAULT_STATE_PATH), help="Arquivo local de estado.")
    parser.add_argument("--seed", type=int, default=7, help="Seed para manter o loop deterministico.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    state_path = Path(args.state_path)

    if args.restart:
        state = restart_game(creator_name=args.name, seed=args.seed)
        save_state(state, state_path)
        print(render_status(state))
        return

    if args.demo:
        print(run_demo(name=args.name, seed=args.seed))
        return

    state = load_state(state_path) or initial_state(creator_name=args.name, seed=args.seed)

    if args.status:
        print(render_status(state))
        return

    interactive_loop(state, state_path, seed=args.seed)


if __name__ == "__main__":
    main()
