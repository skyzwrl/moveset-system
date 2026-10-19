import { Players, ReplicatedStorage, RunService } from "@rbxts/services";
import { DefaultAction, MovesetController, humanoidState } from "@skyzwrl/moveset-system";
import { CombatHooks } from "./hooks";
import { swordKit } from "./sword";

// the server runs the same kit and only trusts moves its own controller starts
const ACTIONS = new Set<string>(["M1", "Skill1", "Skill2", "Skill3", "Skill4", "Ultimate", "Dash"]);

function isAction(value: unknown): value is DefaultAction {
	return typeIs(value, "string") && ACTIONS.has(value);
}

export function serveMovesets(remote: RemoteEvent, hooksFor: (player: Player) => CombatHooks) {
	const controllers = new Map<Player, MovesetController>();

	const track = (player: Player, character: Model) => {
		controllers.get(player)?.destroy();
		const humanoid = character.WaitForChild("Humanoid") as Humanoid;
		controllers.set(player, new MovesetController(swordKit(hooksFor(player)), humanoidState(humanoid)));
	};

	Players.PlayerAdded.Connect((player) => {
		player.CharacterAdded.Connect((character) => track(player, character));
	});

	Players.PlayerRemoving.Connect((player) => {
		controllers.get(player)?.destroy();
		controllers.delete(player);
	});

	remote.OnServerEvent.Connect((player, action, pressed) => {
		const controller = controllers.get(player);
		if (controller === undefined || !isAction(action) || !typeIs(pressed, "boolean")) {
			return;
		}
		if (pressed) {
			controller.press(action);
		} else {
			controller.release(action);
		}
	});

	RunService.Heartbeat.Connect((deltaTime) => {
		for (const [, controller] of controllers) {
			controller.update(deltaTime);
		}
	});
}

export function createMovesetRemote() {
	const remote = new Instance("RemoteEvent");
	remote.Name = "Moveset";
	remote.Parent = ReplicatedStorage;
	return remote;
}
