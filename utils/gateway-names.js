// Default barrel names recognized by all rules. Single entry today; kept as
// an array so the convention can be tweaked or extended without touching call
// sites. Consumers can override by passing `gatewayNames` in any rule's options.
export const GATEWAY_NAMES = ['index']

export const formatGatewayList = (names) =>
	names.map((name) => `${name}.ts`).join(' / ')
