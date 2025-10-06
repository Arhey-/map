import { html, fold } from '../lib/html.js'

function Text(rv) {
    const el = document.createTextNode(rv())
    rv.watch(t => { el.textContent = t })
    return el
}

export class FileList {
    #names = []
    #aTarget = '_blank'
    #el
    constructor(aTarget) {
        this.#aTarget = aTarget
    }

    err(e, el) {
        this.#render(el, html.pre(e.toString()))
    }

    update(names, el) {
        if (!names.length) return;
        this.#names = names
        const lis = names.map(n => {
            const target = this.#aTarget
            const a = html.a({ target, href: `?file=${n}` }, n)
            return html.li(a)
        })
        this.#render(el, html.ul(...lis))
    }

    #render(el, children) {
        const nav = this.#el?.querySelector('nav')
        if (nav) {
            nav.replaceChildren(children)
        } else {
            this.#mount(el, children)
        }
    }

    #mount(el, children) {
        this.#el = el.appendChild(html.dialog(
            html.button(e => e.target.closest('dialog')?.close(), 'close'),
            html.nav(children)
        ))
    }

    show() {
        this.#el?.showModal()
    }

    isExist(name) {
        return this.#names.includes(name)
    }
}

export class Tree {
    #loadRef = () => { throw new Error('set Tree#loadRef') }
    #isLoadRefsAsap = false
    #aTarget = '_blank'
    #lsByUl = new Map

    constructor(load, isLoadRefsAsap, aTarget) {
        this.#loadRef = load
        this.#isLoadRefsAsap = isLoadRefsAsap
        this.#aTarget = aTarget
    }

    get tagBranch() { return 'UL' }

    getFile(el) {
        return getComputedStyle(el).getPropertyValue('--file')
    }

    getNode(el) {
        const li = el.closest('li')
        const ul = li.closest('ul')
        const { key } = li.dataset
        const rt = this.#lsByUl.get(ul)
        const { path, v } = rt.v[key]
        const name = v.name()
        const url = v.url?.()
        const hot = v.hot?.()
        const f = v.f?.()
        return { 
            dir: rt.path, key, path,
            i: { name, url, hot, f },
            li,
            get nextPath() {
                return Object.values(rt.v)
                    .find(i => i.v.f?.() === +key)
                    ?.path
            }
        }
    }

    // TODO path for fork
    makeBranch($$ls, ofFile) {
        const { lis, inconsistent } = this.#makeNodes($$ls)
        const ul = html.ul({ class: { inconsistent } }, ...lis)
        if (ofFile) ul.style.setProperty('--file', ofFile)
        this.#lsByUl.set(ul, $$ls)

        let debaunceFirstLoad // rtdb don't have that ordering kind (half linked list)
        $$ls.onAdd((k, v) => {
            const li = this.#node(k, v)
            const f = v.v.f?.()
            if (!f) return ul.prepend(li);
            const prev = ul.querySelector(`[data-key="${f}"]`)
            if (prev) {
                prev.after(li)
            } else {
                ul.append(li)
                ul.classList.add('inconsistent')
                clearTimeout(debaunceFirstLoad)
                debaunceFirstLoad = setTimeout(() => this.#resortNodes(ul, $$ls), 35)
            }
        })
        $$ls.onRm(k => { ul.querySelector(`[data-key="${k}"]`)?.remove() })
        return ul
    }

    #makeNodes($$ls) {
        const entries = Object.entries($$ls.v)
        const followers = new Map(entries.map(e => [e[1].v.f?.(), e]))
        let lis = []
        let key
        while (true) {
            const f = followers.get(key)
            if (!f) break;
            const [k, v] = f
            lis.push(this.#node(k, v))
            key = +k
        }
        const inconsistent = lis.length !== entries.length
        if (inconsistent) {
            const existingKeys = new Set(lis.map(li => li.dataset.key))
            const missing = entries.filter(e => !existingKeys.has(e[0]))
            lis = lis.concat(missing.map(e => this.#node(e[0], e[1])))
        }
        return { lis, inconsistent }
    }

    #resortNodes(ul, $$ls) {
        if (!ul.classList.contains('inconsistent')) return;
        const entries = Object.entries($$ls.v)
        const followers = new Map(entries.map(e => [e[1].v.f?.(), e[0]]))

        const firstKey = followers.get()
        if (!firstKey) return;
        const first = ul.querySelector(`[data-key="${firstKey}"]`)
        if (!first) return;
        ul.prepend(first);

        let i = 1
        for (let key = firstKey, prev = first; i < entries.length; i++) {
            const f = followers.get(+key)
            if (!f) break;
            const li = ul.querySelector(`[data-key="${f}"]`)
            if (!li) return;
            prev.after(li)
            key = f, prev = li
        }
        if (i === entries.length) {
            ul.classList.remove('inconsistent')
        }
    }

    #node(key, $$node) {
        const li = html.li();
        li.dataset.key = key;

        const ac = new AbortController(); // TODO abort on dispose
        const renew = () => {
            ac.abort()
            li.replaceWith(this.#node(key, $$node))
        };
        $$node.onAdd(renew, ac.signal)
        $$node.onRm(renew, ac.signal)

        const i = $$node.v
        if (i.hot) this.#hot(li, i.hot, ac.signal);
        const f = this.#fileNode(li, i.name, i.file || i.url)
        if (f) return f;
        const title = this.#textOrLink(i.name, i.url, li.classList);
        if (i.ls) return this.#fork(li, title, i.ls, i.fold);
        li.append(title);
        return li
    }

    #hot(li, $hot, signal) {
        let t
        const up = hot => {
            clearTimeout(t)
            if (hot) {
                if (hot < Date.now()) li.classList.add('hot');
                else t = setTimeout(
                    () => li.classList.add('hot'),
                    Math.min(hot - Date.now(), 2 ** 31 - 1)
                );
            } else {
                li.classList.remove('hot')
            }
        }
        up($hot())
        $hot.watch(up, signal)
        signal.addEventListener('abort', () => clearTimeout(t), { once: true })
    }

    // TODO url on add, rm
    #textOrLink($name, $url, liClassList) {
        const nameEl = Text($name)

        const href = $url?.()
        if (!href) return nameEl;

        const a = html.a({ target: '_blank', href }, nameEl)
        this.#icon(href, liClassList)
        $url.watch(u => {
            a.href = u
            this.#icon(u, liClassList)
        })
        return a
    }

    #icon(url, liClassList) {
        liClassList.toggle('yt', url.startsWith('https://www.youtube.com/'))
        liClassList.toggle('google', url.startsWith('https://www.google.com/'))
    }

    #fileNode(li, $name, $urlOrFile) {
        const u = $urlOrFile?.()
        if (!u) return;
        const isUrl = u.startsWith('?r=')
        if (!isUrl && !/\w+/.test(u)) return;
        const href = isUrl ? $urlOrFile : $urlOrFile.map(f => `?r=${f}`)
        const $ref = isUrl
            ? $urlOrFile.map(u => new URLSearchParams(u).get('r'))
            : $urlOrFile;

        const load = () => this.#load($ref(), b);
        const b = html.button(load, 'load');
        if (this.#isLoadRefsAsap) setTimeout(load);
        const target = this.#aTarget
        const a = html.a({ target, href }, ' ', Text($name))
        href.watch(url => { 
            a.href = url
            if (b.disabled) { 
                b.closest('li')?.replaceChildren(b, a)
                b.textContent = 'load'
                b.disabled = false
            }
        })
        li.append(b, a);
        return li
    }

    async #load(name, button) {
        button.disabled = true;
        try {
            const rt = await this.#loadRef(name)
            const li = button.parentElement
            const f = fold(li.children, this.makeBranch(rt, name))
            f.open = true;
            li.append(f)
            button.textContent = 'ok'
        } catch (e) {
            button.disabled = false
            button.append(e)
            document.body.prepend(e) // TODO log ui
            alert(e)
        }
    }

    // TODO add, rm fold
    #fork(li, title, $$ls, $isFold) {
        // TODO path
        const branch = this.makeBranch($$ls)
        if ($isFold?.()) {
            li.append(fold(title, branch))
        } else {
            li.append(title, branch);
        }
        return li
    }

    focusNode(el) {
        const li = el.closest('li')
        if (li) document.body
            .appendChild(html.dialog(li.cloneNode(true)))
            .showModal()
    }
}
