import { reactive } from "../lib/reactive.js"

const isObject = v => v && typeof v === 'object' && !Array.isArray(v)

// TODO EMPTY values
// TODO on()
export class ReTree {
    #v = {}
    #onAdd = []
    #onRm = []

    constructor(v) {
        if (!isObject(v)) throw new Error('ReTree requires an object');
        for (const [k, val] of Object.entries(v)) {
            if (val == null) continue;
            this.#v[k] = isObject(val)
                ? new ReTree(val)
                : reactive(val)
        }
    }

    get v() {
        return this.#v
    }

    get raw() {
        return Object.fromEntries(
            Object.entries(this.#v)
                .map(([k, v]) => [k, v instanceof ReTree ? v.raw : v()])
        )
    }

    add(key, v) {
        if (this.#v[key] != null) {
            console.warn(`${key} already exists`) // TODO ui
            return this.up(key, v)
        }
        const r = this.#v[key] = isObject(v)
            ? new ReTree(v)
            : reactive(v)
        for (const cb of this.#onAdd) {
            cb(key, r)
        }
    }

    rm(key) {
        const old = this.#v[key]
        if (old == null) return;
        old.dispose()
        delete this.#v[key]
        for (const cb of this.#onRm) {
            cb(key)
        }
    }

    up(key, v) {
        if (v == null) return this.rm(key);
        const old = this.#v[key]
        if (old == null) return this.add(key, v);
        if (isObject(v)) {
            if (old instanceof ReTree) {
                old.fullUp(v)
            } else {
                this.rm(key)
                this.add(key, v)
            }
        } else {
            if (old instanceof ReTree) {
                this.rm(key)
                this.add(key, v)
            } else {
                old(v)
            }
        }
    }

    fullUp(v) {
        if (!isObject(v)) throw new Error('ReTree requires an object');
        const oldKeys = Object.keys(this.#v)
        const newKeys = Object.keys(v)
        for (const k of oldKeys) {
            if (!newKeys.includes(k)) this.rm(k)
        }
        for (const k of newKeys) {
            this.up(k, v[k])
        }
    }

    onAdd(cb) { this.#onAdd.push(cb) } // TODO off
    onRm(cb) { this.#onRm.push(cb) } // TODO off

    dispose() {
        for (const v of Object.values(this.#v)) {
            v?.dispose?.()
        }
        this.#v = {}
        this.#onAdd = []
        this.#onRm = []
    }
}
