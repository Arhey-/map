import { reactive } from "../lib/reactive.js"
export { reactive }

const isObject = v => v && typeof v === 'object' && !Array.isArray(v)

// TODO EMPTY values
// TODO on()
export class ReTree {
    #v = {}
    #path = ''
    #onAdd = []
    #onRm = []

    constructor(v, path = '') {
        if (!isObject(v)) throw new Error('ReTree requires an object');
        this.#path = path
        for (const [k, val] of Object.entries(v)) {
            if (val == null) continue;
            this.#v[k] = isObject(val)
                ? new ReTree(val, `${path}/${k}`)
                : reactive(val)
        }
    }

    get v() { return this.#v }
    get path() { return this.#path }

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
            ? new ReTree(v, `${this.#path}/${key}`)
            : reactive(v)
        this.#emit(this.#onAdd, key, r)
    }

    rm(key) {
        const old = this.#v[key]
        if (old == null) return;
        old.dispose()
        delete this.#v[key]
        this.#emit(this.#onRm, key, null)
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

    onAdd(cb, signal) { this.#on(this.#onAdd, cb, signal) } // TODO off
    onRm(cb, signal) { this.#on(this.#onRm, cb, signal) } // TODO off

    #on(handlers, cb, signal) {
        handlers.push(cb) 
        signal?.addEventListener('abort', () => {
            const i = handlers.indexOf(cb)
            if (i !== -1) handlers.splice(i, 1)
        }, { once: true })
    }
    
    #emit(handlers, key, v) {
        for (const cb of [...handlers]) { // copy to avoid endless loop if cb adds handlers
            cb(key, v)
        }
    }

    dispose() {
        for (const v of Object.values(this.#v)) {
            v?.dispose?.()
        }
        this.#v = {}
        this.#onAdd = []
        this.#onRm = []
    }
}
