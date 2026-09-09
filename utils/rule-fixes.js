export const createReplaceSourceFix = (sourceNode, nextSource) => {
	if (!sourceNode || typeof nextSource !== 'string') {
		return null
	}

	return (fixer) => fixer.replaceText(sourceNode, `'${nextSource}'`)
}
