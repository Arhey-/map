import { html, select } from '../lib/html.js'
import { init, onChild, onValue, put } from './rdb.js'
import { reactive, ReTree } from './re-tree.js'
import { Tree, FileList } from './ui.js'
import { bookmarklet } from './bookmarklet.js'

const isMobile = navigator.userAgent.includes('obile');
const query = new URL(location).searchParams;
const isLoadRefsOnStart = query.has('load-refs');
const aTarget = query.get('target') || '_blank';

const tree = new Tree(connect, isLoadRefsOnStart, aTarget)
const fileList = new FileList(aTarget)
const rxName = reactive('')
const tool = {
	get active() { return tool.editor?.name.value || tool.action.value },
	editor: null, editorFieldset: null,
};

const { rtdbURL } = localStorage;
if (!rtdbURL) {
	editCredentials()
} else try {
	await init(rtdbURL)
	const r = query.get('file') || query.get('r')
	if (r) {
		if (r != 'main') document.title += ` - ${r}`;
		const root = await connect(r);
		const nav = document.body.appendChild(html.nav({ class: 'tree' }));
		nav.append(tree.makeBranch(root, r));
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
	const fs = tool.editorFieldset
	if (fs) fs.disabled = true;
	try {
		await put(path, updates)
	} finally {
		spin.remove()
		if (fs) fs.disabled = false;
	}
}


function makeTool() {
	const action = select([['', 'action'], 'edit', 'file', 'focus', 'airy'])
	action.onchange = () => {
		document.body.classList.toggle('mode-read', tool.action.value == 'airy')
		if ('file' == action.value) {
			newFile().finally(() => {
				action.value = ''
				action.onchange()
			})
		} else if (!action.value) {
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

	if (isMobile) document.body.classList.add('mobile')
}

function makeEditor() {
	if (tool.editor) { // TODO replace tool.add.onclick
		if (tool.action.value == 'edit') saveEdit();
		return
	}
	const name = html.textarea({
		name: 'name',
		placeholder: 'name or .bkm',
		class: 'wide',
		rows: 1,
		oninput() { rxName(this.value) },
		onfocus() {
			if (tool.action.value != 'edit') tool.action.value = '';
			if (!name.value) navigator.clipboard.readText().then(n => {
				if (n.startsWith('{')) {
					name.value = n
					name.onchange()
					navigator.clipboard.writeText('')
				}
			})
		},
		onchange() {
			if (name.value == '.bkm') {
				return void navigator.clipboard
					.writeText(bookmarklet)
					.then(() => name.value = '')
			}
			if (name.value.startsWith('{"name":"')) {
				const i = JSON.parse(name.value)
				name.value = i.name;
				url.value = i.url;
			}
			tool.action.onchange()
		}
	})
	rxName.map(n => n.includes('\n') ? 2 : 1).watch(r => name.rows = r)
	rxName.map(n => !!n).watch(hasName => {
		url.hidden = hot.hidden = fold.hidden = reset.hidden = !hasName;
	})
	const hidden = true
	const url = html.input({ name: 'url', placeholder: 'url', class: 'wide', hidden})
	const hot = html.input({ name: 'hot', type: 'date', hidden})
	const fold = html.input({ name: 'fold', type: 'checkbox', hidden})
	const lFold = html.label(fold, 'fold')
	const rm = html.button({ class: 'rm', onclick: saveRm }, 'remove')
	const reset = html.button({ type: 'reset', hidden }, 'reset')
	tool.editorFieldset = html.fieldset({ class: 'all' }, name, url, hot, lFold, rm, reset)
	tool.editor = html.form({
		name: 'editor',
		class: 'wide',
		onreset() { 
			setTimeout(() => { rxName(name.value) })
			tool.action.onchange()
		}
	}, tool.editorFieldset)
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
	editor.fold.value = !!i.fold;
	tool.add.textContent = 'apply'
	editor.name.onchange()
}

async function saveEdit() {
	const s = document.querySelector('.tree .selected') // TODO? tree.selected
	if (!s) return;
	const { path } = tree.getNode(s)
	const { name, url, hot, fold } = tool.editor;
	// todo only changed, if no change return
	await save(path, {
		name: name.value || null,
		url: url.value || null,
		hot: hot.valueAsNumber || null,
		fold: fold.value || null,
	});
	s.classList.remove('selected')
	tool.add.textContent = 'add'
	tool.editor.reset()
}

async function saveRm() {
	const s = document.querySelector('nav.tree .selected') // TODO? tree.selected
	if (!s) return;
	const { path, nextPath, i } = tree.getNode(s)
	const updates = { [path]: null };
	if (nextPath) updates[`${nextPath}/f`] = i.f || null;
	await save('/', updates);
	s.classList.remove('selected')
	tool.add.textContent = 'add'
	// leave editor as is to allow quick add after rm
}

function removeAskPlace() {
	const prev = document.querySelector('.tree .ask-place-parent')
	if (prev) {
		prev.classList.remove('ask-place-parent')
		prev.querySelectorAll('.ask-place').forEach(e => e.remove())
	}
}

function askWhereToAdd(target) {
	const { li } = tree.getNode(target)
	if (li.classList.contains('ask-place-parent')) return;

	removeAskPlace()
	li.classList.add('ask-place-parent')
	li.prepend(html.div({ class: 'ask-place' }, html.button(saveAdd, 'add before')))
	li.append(html.div(
		{ class: 'ask-place' },
		html.button(saveAdd, 'add after'),
		html.button(saveAdd, 'add in')
	))
}

async function saveAdd() {
	for (const b of document.querySelectorAll('.tree .ask-place button')) {
		b.disabled = true
	}
	const key = Date.now()
	const { name, url, hot } = tool.editor;
	if (!name.value) {
		alert('name required')
		throw new Error('name required')
	}
	const i = {
		name: name.value,
		url: url.value || null,
		hot: hot.valueAsNumber || null,
	}
	const isMulti = name.value.trim().includes('\n')
	const target = tree.getNode(this)
	const isSub = this.textContent.includes('in')
	const updates = {};
	if (isSub) {
		if (isMulti) {
			newList(name.value, updates, `${target.path}/ls/`, 0)
		} else {
			updates[`${target.path}/ls/${key}`] = i
		}
	} else if (this.textContent.includes('before')) {
		if (isMulti) {
			const lastKey = newList(name.value, updates, `${target.dir}/`, target.i.f || 0)
			updates[`${target.path}/f`] = lastKey
		} else {
			if (target.i.f) i.f = target.i.f;
			updates[`${target.dir}/${key}`] = i
			updates[`${target.path}/f`] = key
		}
	} else {
		const { nextPath } = target
		if (isMulti) {
			const lastKey = newList(name.value, updates, `${target.dir}/`, +target.key)
			if (nextPath) updates[`${nextPath}/f`] = lastKey;
		} else {
			i.f = +target.key
			updates[`${target.dir}/${key}`] = i
			if (nextPath) updates[`${nextPath}/f`] = key;
		}
	}
	await save('/', updates);
	removeAskPlace()
	tool.editor.reset()
}

// names only
function newList(mdNames, updates, path, f) {
	let key = Date.now()
	const names = mdNames
		.split('\n')
		.map(s => s.replace(/^\s*[-*]\s+/, '').trim())
		.filter(Boolean);
	for (const name of names) {
		key++;
		updates[`${path}${key}`] = f ? { name, f } : { name };
		f = key;
	}
	return key
}

async function newFile() {
	const s = document.querySelector('.tree .selected') // TODO? tree.selected
	if (!s) return await newBlankFile();

	const { path, i: { name, url, ls } } = tree.getNode(s)
	if (!ls) return alert('select item with sub list to extract');
	if (url) {
		const key = Date.now()
		Object.values(ls)
			.find(i => !i.f)
			.f = key;
		ls[key] = { name, url }
	}
	const f = prompt('new file name', name.replace(/\W+/g, '_'))
	if (!f) return;
	if (fileList.isExist(f)) return alert('alredy exist');
	await save('/', {
		[`map/index/${f}`]: 1,
		[`map/ls/${f}/ls`]: ls,
		[`${path}/url`]: `?r=${f}`,
		[`${path}/fold`]: null,
		[`${path}/ls`]: null,
	});
}

async function newBlankFile() {
	const f = prompt('new blank file name')
	if (!f) return;
	if (fileList.isExist(f)) return alert('alredy exist');
	await save('/', {
		[`map/index/${f}`]: 1,
		[`map/ls/${f}/ls/${Date.now()}`]: { name: '__' + f }
	});
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
