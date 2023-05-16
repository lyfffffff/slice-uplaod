export class useNamespace {
	pre = null;
	constructor(name) {
		this.pre = name;
	}

	s() {
		return this.pre;
	}

	m(name) {
		return this.pre + '-' + name;
	}

	mm(m1, m2) {
		return this.pre + '-' + m1 + '-' + m2;
	}

	b(name) {
		return this.pre + '_' + name;
	}
}

export const proStorage = {
	save(key, value) {
		localStorage.setItem(key, JSON.stringify(value));
	},
	fetch(key) {
		let res = JSON.parse(localStorage.getItem(key));
		return res != null ? res : [];
	},
	remove(key) {
		localStorage.removeItem(key);
	},
};

function receiveController(to, from) {
	Object.assign(to, from);
}

/* vue 混入模式 */
receiveController.mixin = {
	methods: {
		receiveController,
	},
};

export { receiveController };
