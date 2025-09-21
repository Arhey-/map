import { html, select } from '../lib/html.js'
import { init, onChild, onValue } from './rdb.js'
import { ReTree } from './re-tree.js'
import { Tree, FileList } from './ui.js'
import { bookmarklet } from './bookmarklet.js'

const isMobile = navigator.userAgent.includes('obile');
const query = new URL(location).searchParams;
const isLoadRefsOnStart = query.has('load-refs');
const aTarget = query.get('target') || '_blank';

const tree = new Tree(connect, isLoadRefsOnStart, aTarget)
const tool = {
	get active() { return adding.name_?.value || tool.action.value }
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
		document.body.append(tree.makeBranch(root, n));
	}
	makeTool();
	document.addEventListener('click', handlePlace);
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
	const rt = new ReTree({});
	await onChild(`map/ls/${name}/ls`, (ev, k, v) => {
		if ('add' == ev) rt.add(k, v);
		if ('up' == ev) rt.up(k, v);
		if ('rm' == ev) rt.rm(k);
		// TODO last up
	});
	return rt
}


// TODO wtf
function makeTool() {
	const action = select([['', 'action'], 'edit', 'focus'])
	action.onchange = () => {
		if (isMobile) document.body.classList.toggle('edit-mode', tool.action.value)
		if (action.value) {
			if (action.value == 'mv') batch.checked = true
		} else {
			const s = document.querySelector('.selected')
			if (!s) return;
			s.classList.remove('selected')
			tool.add.textContent = 'add'
			adding.name_?.form.reset()
		}
	}
	tool.action = action

	const batch = html.input({
		type: 'checkbox', onchange: () => {
			if (batch.checked) return;
			action.value = ''
			action.onchange()
			// put().catch(e => alert('err: ' + e))
		}
	})
	tool.batch = batch

	tool.add = html.button(adding, 'add')
	tool.el = html.div({ className: 'tool' },
		html.button(() => fileList.show(), 'ls'),
		tool.add,
		html.label(batch, 'batch'),
		action
	)
	document.body.append(tool.el)
}

// TODO wtf
function adding() {
	if (adding.name_) {
		if (tool.action.value == 'edit') alert('TODO sync edit')
		return
	}
	const name = html.input({
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
	}
	const url = html.input({ placeholder: 'url', className: 'wide', hidden: true })
	const hot = html.input({ type: 'date', hidden: true })
	document.body.querySelector('.tool').prepend(html.form({
		className: 'wide', onreset() { tool.action.onchange() }
	}, name, url, hot))

	adding.name_ = name;
	adding.url = url;
	adding.hot = hot;
}

function handlePlace(e) {
	if (!tool.active) return;
	const file = tree.getFile(e.target)
	if (!file) return;
	if (e.target.tagName === tree.tagBranch) {
		alert('tap on tree node')
		return
	}
	e.preventDefault()
	e.stopPropagation()
	const action = tool.action.value
	if ('focus' == action) return tree.focusNode(e.target)
	if ('edit' == action) return selectForEditOrSkip(e.target)

	alert(`TODO save to ${file}`)
	adding.name_.form.reset()
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
	if (!adding.name_) adding()
	adding.name_.form.reset();
	adding.name_.value = i.name || '';
	adding.url.value = i.url || '';
	if (i.hot) adding.hot.valueAsNumber = i.hot;
	tool.add.textContent = 'apply'
	adding.name_.onchange()
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
