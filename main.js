import { html, select } from '../lib/html.js'
import { init, onChild, onValue, put } from './rdb.js'
import { ReTree } from './re-tree.js'
import { Tree, FileList } from './ui.js'
import { bookmarklet } from './bookmarklet.js'

const isMobile = navigator.userAgent.includes('obile');
const query = new URL(location).searchParams;
const isLoadRefsOnStart = query.has('load-refs');
const aTarget = query.get('target') || '_blank';

const tree = new Tree(connect, isLoadRefsOnStart, aTarget)
const tool = {
	get active() { return tool.editor?.name.value || tool.action.value },
	editor: null,
};
const fileList = new FileList(aTarget)

const { rtdbURL } = localStorage;
if (!rtdbURL) {
	editCredentials()
} else try {
	await init(rtdbURL)
	const n = query.get('file')
	if (n) {
		if (n != 'main') document.title += ` - ${n}`;
		const root = await connect(n);
		const nav = document.body.appendChild(html.nav({ class: 'tree' }));
		nav.append(tree.makeBranch(root, n));
	}
	makeTool();
	document.addEventListener('click', handlePlace); // TODO tree.onClick
	document.addEventListener('keydown', handleKeys);

	onValue('map/index', index => {
		const ls = index ? Object.keys(index) : []
		fileList.update(ls, document.body)
		// TODO last up
	}, e => fileList.err(e, document.body))
} catch (e) {
	editCredentials(e)
}

// throw new Error(`"${name}" load error`); // TODO
async function connect(name) {
	const path = `map/ls/${name}/ls`;
	const rt = new ReTree({}, path);
	await onChild(path, (ev, k, v) => {
		if ('add' == ev) rt.add(k, v);
		if ('up' == ev) rt.up(k, v);
		if ('rm' == ev) rt.rm(k);
		// TODO last up
	});
	return rt
}

async function save(path, updates) {
	const spin = document.body.appendChild(html.div({ className: 'spin' }))
	await put(path, updates).finally(() => spin.remove());
}


function makeTool() {
	const action = select([['', 'action'], 'edit', 'focus'])
	action.onchange = () => {
		if (isMobile) document.body.classList.toggle('edit-mode', tool.action.value)
		if (!action.value) {
			const s = document.querySelector('.selected')
			if (!s) return;
			s.classList.remove('selected')
			tool.add.textContent = 'add'
			tool.editor?.reset()
		}
	}

	tool.el = html.div({ className: 'tool' },
		html.button(() => fileList.show(), 'ls'),
		tool.add = html.button(makeEditor, 'add'),
		tool.action = action
	)
	document.body.append(tool.el)
}

function makeEditor() {
	if (tool.editor) { // TODO replace tool.add.onclick
		if (tool.action.value == 'edit') saveEdit();
		return
	}
	const name = html.input({
		name: 'name',
		placeholder: 'name or .bkm', className: 'wide', onfocus: () => {
			if (tool.action.value != 'edit') tool.action.value = '';
			if (!name.value) navigator.clipboard.readText().then(n => {
				if (n.startsWith('{')) {
					name.value = n
					name.onchange()
					navigator.clipboard.writeText('')
				}
			})
		}
	})
	name.onchange = () => {
		if (name.value == '.bkm') {
			navigator.clipboard.writeText(bookmarklet).then(() => name.value = '')
			return;
		}
		if (name.value.startsWith('{"name":"')) {
			const i = JSON.parse(name.value)
			name.value = i.name;
			url.value = i.url;
		}
		url.hidden = hot.hidden = !name.value;
		tool.action.onchange()
	};
	const url = html.input({ name: 'url', placeholder: 'url', className: 'wide', hidden: true })
	const hot = html.input({ name: 'hot', type: 'date', hidden: true })
	tool.editor = html.form({
		name: 'editor',
		className: 'wide',
		onreset() { tool.action.onchange() }
	}, name, url, hot)
	tool.el.prepend(tool.editor)
}

function handlePlace(e) {
	if (!tool.active) return;
	if (!tree.getFile(e.target)) return;
	if (e.target.tagName === tree.tagBranch) {
		alert('tap on tree node')
		return
	}
	e.preventDefault()
	e.stopPropagation()
	const action = tool.action.value
	if ('focus' == action) return tree.focusNode(e.target);
	if ('edit' == action) return selectForEditOrSkip(e.target);

	askWhereToAdd(e.target)
}

function handleKeys(e) {
	const { nodeName } = e.target;
	if (
		nodeName != 'INPUT'
		&& 'TEXTAREA' != nodeName
		&& e.code == 'KeyK'
		&& e.metaKey
	) tool.action.focus()
}

function selectForEditOrSkip(target) {
	document.querySelector('.selected')?.classList.remove('selected')
	const { i, li } = tree.getNode(target)
	li.classList.add('selected')
	if (!tool.editor) makeEditor();
	const { editor } = tool;
	editor.reset();
	editor.name.value = i.name || '';
	editor.url.value = i.url || '';
	if (i.hot) editor.hot.valueAsNumber = i.hot;
	tool.add.textContent = 'apply'
	editor.name.onchange()
}

async function saveEdit() {
	const s = document.querySelector('.selected') // TODO? tree.selected
	if (!s) return;
	if (!getComputedStyle(s).getPropertyValue('--file')) return; // TODO incapsulate
	const { path } = tree.getNode(s)
	const { name, url, hot } = tool.editor;
	// todo only changed, if no change return
	await save(path, {
		name: name.value || null,
		url: url.value || null,
		hot: hot.valueAsNumber || null,
	});
	s.classList.remove('selected')
	tool.add.textContent = 'add'
	tool.editor.reset()
}

function askWhereToAdd(target) {
	document.querySelectorAll('.tree .ask-place').forEach(e => e.remove())
	const { li } = tree.getNode(target)
	li.prepend(html.div({ class: 'ask-place' }, html.button(saveAdd, 'add before')))
	li.append(html.div({ class: 'ask-place' }, html.button(saveAdd, 'add after')))
}

async function saveAdd() {
	for (const b of document.querySelectorAll('.tree .ask-place button')) {
		b.disabled = true
	}
	const { path } = tree.getNode(this)
	alert(this.textContent, path)
	// tool.editor.reset()
}

function editCredentials(error = '') {
	document.body.innerHTML = `<p>${error}</p>`;
	document.body.append(
		input('rtdbURL', rtdbURL),
		html.p('enter correct creds and reload')
	);
}

function input(name, value = '') {
	const i = html.input({
		type: 'text',
		value,
		onchange: () => localStorage.setItem(name, i.value),
	});
	return html.p(html.label(name, i));
}
