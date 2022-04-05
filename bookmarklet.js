const f = () => addEventListener(
	'focus',
	() => navigator.clipboard.writeText(JSON.stringify({ name: document.title, url: location.href })),
	{ once: true }
)

export const bookmarklet = f.toString()
	.replace(/(\s)/g, '')
	.replace(/^\(\)=>/, '')