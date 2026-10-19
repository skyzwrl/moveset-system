import { Binding, CancelRule, Chain, ChainHit, DefaultAction, Kit, Move, MoveBinding } from "./types";

const DEFAULT_CHAIN_WINDOW = 0.6;
const DEFAULT_BUFFER_WINDOW = 0.2;

export class ChainBuilder<A extends string = DefaultAction> {
	private readonly hits = new Array<ChainHit<A>>();
	private windowSeconds = DEFAULT_CHAIN_WINDOW;
	private finisherCooldownSeconds = 0;
	private whiffResets = true;

	public hit(move: Move<A>, air?: Move<A>): this {
		this.hits.push({ move, air });
		return this;
	}

	/** how long after a hit ends the next press still continues the string */
	public window(seconds: number): this {
		this.windowSeconds = seconds;
		return this;
	}

	public finisherCooldown(seconds: number): this {
		this.finisherCooldownSeconds = seconds;
		return this;
	}

	public resetOnWhiff(enabled: boolean): this {
		this.whiffResets = enabled;
		return this;
	}

	public build(): Chain<A> {
		return {
			hits: [...this.hits],
			window: this.windowSeconds,
			finisherCooldown: this.finisherCooldownSeconds,
			resetOnWhiff: this.whiffResets,
		};
	}
}

abstract class BindingsBuilder<A extends string> {
	protected readonly bindings = new Map<A, Binding<A>>();

	public tap(action: A, move: Move<A>): this {
		this.bindings.set(action, { ...this.moveBinding(action), tap: move });
		return this;
	}

	public hold(action: A, move: Move<A>, after: number): this {
		this.bindings.set(action, { ...this.moveBinding(action), hold: { move, after } });
		return this;
	}

	public charge(action: A, move: Move<A>, min: number, max: number): this {
		this.bindings.set(action, { ...this.moveBinding(action), charge: { move, min, max } });
		return this;
	}

	public chain(action: A, configure: (chain: ChainBuilder<A>) => void): this {
		if (this.bindings.has(action)) {
			throw `"${action}" is already bound`;
		}
		const chain = new ChainBuilder<A>();
		configure(chain);
		this.bindings.set(action, { kind: "Chain", chain: chain.build() });
		return this;
	}

	private moveBinding(action: A): MoveBinding<A> {
		const existing = this.bindings.get(action);
		if (existing === undefined) {
			return { kind: "Move" };
		}
		if (existing.kind === "Chain") {
			throw `"${action}" is already bound to a chain`;
		}
		return existing;
	}
}

export class StanceBuilder<A extends string = DefaultAction> extends BindingsBuilder<A> {
	public build(): ReadonlyMap<A, Binding<A>> {
		return copy(this.bindings);
	}
}

export class MovesetBuilder<A extends string = DefaultAction> extends BindingsBuilder<A> {
	private readonly stances = new Map<string, ReadonlyMap<A, Binding<A>>>();
	private readonly cancels = new Array<CancelRule<A>>();
	private bufferSeconds = DEFAULT_BUFFER_WINDOW;

	public constructor(private readonly name: string) {
		super();
	}

	/** bindings that replace the base ones while the stance is active */
	public stance(name: string, configure: (stance: StanceBuilder<A>) => void): this {
		if (this.stances.has(name)) {
			throw `Stance "${name}" is already defined`;
		}
		const stance = new StanceBuilder<A>();
		configure(stance);
		this.stances.set(name, stance.build());
		return this;
	}

	/** a cancel route every move in the kit gets */
	public cancel(rule: CancelRule<A>): this {
		this.cancels.push(rule);
		return this;
	}

	public bufferWindow(seconds: number): this {
		this.bufferSeconds = seconds;
		return this;
	}

	public build(): Kit<A> {
		const kit: Kit<A> = {
			name: this.name,
			bindings: copy(this.bindings),
			stances: copy(this.stances),
			cancels: [...this.cancels],
			bufferWindow: this.bufferSeconds,
		};
		validate(kit);
		return kit;
	}
}

function copy<K, V>(source: ReadonlyMap<K, V>): Map<K, V> {
	const result = new Map<K, V>();
	for (const [key, value] of source) {
		result.set(key, value);
	}
	return result;
}

function validate<A extends string>(kit: Kit<A>): void {
	const fail = (message: string): never => {
		throw `Kit "${kit.name}": ${message}`;
	};

	const seconds = (label: string, value: number) => {
		if (!(value >= 0 && value < math.huge)) {
			fail(`${label} must be a finite number of seconds, got ${value}`);
		}
	};

	const checkRules = (rules: ReadonlyArray<CancelRule<A>>, owner: string) => {
		for (const rule of rules) {
			if (rule.into.isEmpty() || rule.during.isEmpty()) {
				fail(`a cancel rule on ${owner} needs at least one action and one phase`);
			}
		}
	};

	// the same move object can be bound twice (it then shares a cooldown), two different moves can't share a name
	const moves = new Map<string, Move<A>>();
	const checkMove = (move: Move<A>) => {
		const existing = moves.get(move.name);
		if (existing === move) {
			return;
		}
		if (move.name === "") {
			fail("every move needs a name");
		}
		if (existing !== undefined) {
			fail(`two different moves are named "${move.name}"`);
		}
		moves.set(move.name, move);

		seconds(`"${move.name}" startup`, move.startup);
		seconds(`"${move.name}" active`, move.active);
		seconds(`"${move.name}" recovery`, move.recovery);
		if (move.cooldown !== undefined) {
			seconds(`"${move.name}" cooldown`, move.cooldown);
		}
		if (move.cancels !== undefined) {
			checkRules(move.cancels, `"${move.name}"`);
		}
	};

	const checkBindings = (bindings: ReadonlyMap<A, Binding<A>>) => {
		for (const [action, binding] of bindings) {
			if (binding.kind === "Chain") {
				const chain = binding.chain;
				if (chain.hits.isEmpty()) {
					fail(`the "${action}" chain has no hits`);
				}
				for (const hit of chain.hits) {
					checkMove(hit.move);
					if (hit.air !== undefined) {
						checkMove(hit.air);
					}
				}
				seconds(`the "${action}" chain window`, chain.window);
				seconds(`the "${action}" finisher cooldown`, chain.finisherCooldown);
				continue;
			}

			const { tap, hold, charge } = binding;
			if (hold !== undefined && charge !== undefined) {
				fail(`"${action}" can't have both a hold and a charge move`);
			}
			if (tap !== undefined) {
				checkMove(tap);
			}
			if (hold !== undefined) {
				checkMove(hold.move);
				if (!(hold.after > 0 && hold.after < math.huge)) {
					fail(`"${action}" hold threshold must be greater than 0, got ${hold.after}`);
				}
			}
			if (charge !== undefined) {
				checkMove(charge.move);
				seconds(`"${action}" minimum charge`, charge.min);
				if (!(charge.max > charge.min && charge.max < math.huge)) {
					fail(`"${action}" maximum charge must be greater than its minimum`);
				}
			}
		}
	};

	checkBindings(kit.bindings);
	for (const [, bindings] of kit.stances) {
		checkBindings(bindings);
	}
	checkRules(kit.cancels, "the kit");
	seconds("buffer window", kit.bufferWindow);
}
