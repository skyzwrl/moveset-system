import { CharacterState, Move, MovesetController } from "..";

export interface FakeCharacter extends CharacterState {
	grounded: boolean;
	stunned: boolean;
}

export function createCharacter(): FakeCharacter {
	return {
		grounded: true,
		stunned: false,
		isGrounded() {
			return this.grounded;
		},
		isStunned() {
			return this.stunned;
		},
	};
}

// 0.125 + 0.125 + 0.25: binary fractions, so boundaries land exactly on update steps
export function move(name: string, overrides: Partial<Move> = {}): Move {
	return { name, startup: 0.125, active: 0.125, recovery: 0.25, ...overrides };
}

export function record(controller: MovesetController): string[] {
	const log = new Array<string>();
	controller.moveStarted.connect((context) => log.push(`start ${context.move.name}`));
	controller.moveEnded.connect((context, reason) => log.push(`end ${context.move.name} ${reason}`));
	controller.comboChanged.connect((action, index) => log.push(`combo ${action} ${index}`));
	return log;
}

export function started(controller: MovesetController): string[] {
	const names = new Array<string>();
	controller.moveStarted.connect((context) => names.push(context.move.name));
	return names;
}
