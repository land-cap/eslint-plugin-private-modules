import { GATEWAY_NAMES } from './gateway-names.js'

export const getRuleOptions = (context) => {
	const ruleOptions = context.options[0] ?? {}

	return {
		aliases: ruleOptions.aliases ?? {},
		gatewayNames: ruleOptions.gatewayNames ?? GATEWAY_NAMES,
		filename: context.filename ?? context.getFilename(),
	}
}
