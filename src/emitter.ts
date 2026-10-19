type Listener<T extends unknown[]> = (...args: T) => void;

export class Emitter<T extends unknown[]> {
	// replaced rather than mutated, so a fire keeps walking the list it started with
	private listeners = new Array<Listener<T>>();

	public connect(listener: Listener<T>): () => void {
		this.listeners = [...this.listeners, listener];

		let connected = true;
		return () => {
			if (!connected) {
				return;
			}
			connected = false;

			const index = this.listeners.indexOf(listener);
			if (index !== -1) {
				const remaining = [...this.listeners];
				remaining.remove(index);
				this.listeners = remaining;
			}
		};
	}

	public fire(...args: T): void {
		for (const listener of this.listeners) {
			listener(...args);
		}
	}

	public clear(): void {
		this.listeners = [];
	}
}
