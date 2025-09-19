import { html, fold } from '../lib/html.js'

export class FileList {
    #aTarget = '_blank'
    #ls
    constructor(aTarget) {
        this.#aTarget = aTarget
    }

    err(e, el) {
        this.#dialog(el, html.pre(e.toString()))
    }

    render(names, el) {
        if (!names.length) return;
        this.#ls?.remove()
        const lis = names.map(n => {
            const target = this.#aTarget
            const a = html.a({ target, href: `?file=${n}` }, n)
            return html.li(a)
        })
        this.#dialog(el, html.ul(...lis))
    }

    #dialog(el, children) {
        this.#ls = el.appendChild(html.dialog(
            html.button(e => e.target.closest('dialog')?.close(), 'close'),
            children
        ))
    }

    show() {
        this.#ls?.showModal()
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
        const i = this.#lsByUl.get(ul)[key]
        return { i, li }
    }

    // TODO path
    makeBranch(ls, ofFile) {
        const entries = Object.entries(ls)
        const followers = new Map(entries.map(e => [e[1].f, e]))
        const lis = []
        let key
        while (true) {
            const f = followers.get(key)
            if (!f) break;
            const [k, v] = f
            lis.push(this.#node(k, v))
            key = +k
        }
        const inconsistent = lis.length !== entries.length

        const ul = html.ul({ class: { inconsistent } }, ...lis)
        if (ofFile) ul.style.setProperty('--file', ofFile)
        this.#lsByUl.set(ul, ls)
        return ul
    }

    #node(key, i) {
        const { name, file, hot } = i
        const li = html.li();
        li.dataset.key = key;
        if (hot) {
            if (hot < Date.now()) li.classList.add('hot');
            else setTimeout(
                () => li.classList.add('hot'),
                Math.min(hot - Date.now(), 2 ** 31 - 1)
            )
        }
        if (file) return this.#fileNode(li, file, name)
        const title = i.url
            ? html.a({ target: '_blank', href: i.url, }, name)
            : name
        if (i.url?.startsWith('https://www.youtube.com/')) li.classList.add('yt')
        if (i.url?.startsWith('https://www.google.com/')) li.classList.add('google')
        if (i.ls) return this.#fork(li, title, i.ls, i.fold);
        li.append(title);
        return li
    }

    // FIXME fileLoader
    #fileNode(li, file, name) {
        const load = () => this.#load(file, b);
        const b = html.button(load, 'load');
        if (this.#isLoadRefsAsap) setTimeout(load);
        const target = this.#aTarget
        const a = html.a({ target, href: `?file=${file}` }, ` ${name}`);
        li.append(b, a);
        return li
    }

    async #load(name, button) {
        button.disabled = true;
        try {
            const i = await this.#loadRef(name)
            const li = button.parentElement
            const f = fold(li.children, this.makeBranch(i.ls, name))
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

    #fork(li, title, ls, isFold) {
        const branch = this.makeBranch(ls)
        if (isFold) {
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
