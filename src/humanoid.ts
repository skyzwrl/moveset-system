import { CharacterState } from "./types";

export function humanoidState(
	humanoid: Humanoid,
	stunned = () => humanoid.Parent?.GetAttribute("Stunned") === true,
): CharacterState {
	return {
		isGrounded() {
			return humanoid.FloorMaterial !== Enum.Material.Air;
		},
		isStunned() {
			return stunned();
		},
	};
}
