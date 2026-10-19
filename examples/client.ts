import { ContextActionService, Players, RunService } from "@rbxts/services";
import { DefaultAction, MovesetController, humanoidState } from "@skyzwrl/moveset-system";
import { CombatHooks } from "./hooks";
import { swordKit } from "./sword";

const INPUTS = new Map<DefaultAction, Enum.KeyCode | Enum.UserInputType>([
	["M1", Enum.UserInputType.MouseButton1],
	["Skill1", Enum.KeyCode.One],
	["Skill2", Enum.KeyCode.Two],
	["Skill3", Enum.KeyCode.Three],
	["Skill4", Enum.KeyCode.Four],
	["Ultimate", Enum.KeyCode.G],
	["Dash", Enum.KeyCode.Q],
]);

export function bindMoveset(hooks: CombatHooks) {
	const player = Players.LocalPlayer;
	const character = player.Character ?? player.CharacterAdded.Wait()[0];
	const humanoid = character.WaitForChild("Humanoid") as Humanoid;

	const controller = new MovesetController(swordKit(hooks), humanoidState(humanoid));

	for (const [action, input] of INPUTS) {
		ContextActionService.BindAction(
			action,
			(_, state) => {
				if (state === Enum.UserInputState.Begin) {
					controller.press(action);
				} else if (state === Enum.UserInputState.End) {
					controller.release(action);
				}
			},
			false,
			input,
		);
	}

	const render = RunService.PreRender.Connect((deltaTime) => controller.update(deltaTime));

	controller.comboChanged.connect((action, index) => {
		if (action === "M1") {
			character.SetAttribute("ComboIndex", index);
		}
	});

	humanoid.Died.Once(() => {
		render.Disconnect();
		for (const [action] of INPUTS) {
			ContextActionService.UnbindAction(action);
		}
		controller.destroy();
	});

	return controller;
}
