import type { BaseType, Force, SimulationLinkDatum, SimulationNodeDatum, ValueFn, ZoomTransform } from 'd3';
import { HierarchicalGraphNodeDatum } from '../GraphData/GraphNodesAndLinks';
import type {
	HierarchicalGraphLink,
	HierarchicalGraphNode,
	InteractionState,
	NodeOrLink,
	WithShortLine,
} from '../GraphData/types';
import { defNum } from '../utils';

export const clampXyToRadius = ([x1, y1]: [number, number], radius?: number) => {
	let x = x1;
	let y = y1;
	if (!radius) return { x, y, wasClamped: false };
	if (radius < 0) return { x: 0, y: 0, wasClamped: true };
	const xyRadius = Math.hypot(x, y);
	if (xyRadius > radius) {
		const theta = Math.atan2(x, y);
		x = Math.sin(theta) * radius;
		y = Math.cos(theta) * radius;
	}
	const wasClamped = xyRadius > radius;
	return { x, y, wasClamped, xyRadius, radius };
};

type ForceFunction<T> = (node: T, i: number, nodes: T[]) => number;

export function forceClampToRadius<NodeDatum extends SimulationNodeDatum = SimulationNodeDatum>(
	radius: number | ForceFunction<NodeDatum> = 30
): Force<NodeDatum, SimulationLinkDatum<NodeDatum>> {
	let nodes: NodeDatum[];
	let radiuses: number[];
	const radius2 = typeof radius !== 'function' ? (constant(+radius) as ForceFunction<NodeDatum>) : radius;

	function force(_alpha: number) {
		for (let i = 0, n = nodes.length; i < n; ++i) {
			const node = nodes[i];
			const r = radiuses[i];
			const xNext = node.x! + node.vx!;
			const yNext = node.y! + node.vy!;
			const { wasClamped, x: fx, y: fy } = clampXyToRadius([xNext, yNext], r);
			if (wasClamped) {
				node.vx = 0;
				node.vy = 0;
				node.x = fx;
				node.y = fy;
			}
		}
	}

	function initialize() {
		if (!nodes) return;
		let i;
		const n = nodes.length;
		radiuses = new Array(n);
		for (i = 0; i < n; ++i) {
			radiuses[i] = +radius2(nodes[i], i, nodes);
		}
	}

	force.initialize = function (_: NodeDatum[]) {
		(nodes = _), initialize();
	};

	return force;
}

function constant(x: any) {
	return function (..._: any[]) {
		return x;
	};
}

export function dotGrid(element: HTMLElement | SVGElement = document.documentElement, dotDistance = 40) {
	function draw(transform: ZoomTransform) {
		// https://stackoverflow.com/a/466256/5648839
		const roundDownToPower = Math.pow(2, Math.floor(Math.log2(transform.k)));
		const dotSpacing = (transform.k / roundDownToPower) * dotDistance;
		const dotOffsetX = transform.x % dotSpacing;
		const dotOffsetY = transform.y % dotSpacing;
		const dotSubOpacity = (dotSpacing - dotDistance) / dotDistance;

		element.style.setProperty('--dot-spacing', dotSpacing + 'px');
		element.style.setProperty('--dot-offset-x', dotOffsetX + 'px');
		element.style.setProperty('--dot-offset-y', dotOffsetY + 'px');
		element.style.setProperty('--dot-sub-opacity-multiplier', dotSubOpacity + '');
	}

	return draw;
}

export function positionParentLinkNodes(parentNode: HierarchicalGraphNode) {
	// TODO: make pure function // probably just the forEach part
	// add this as some kind of getter for things
	const parentLinkNodes = parentNode.children?.filter((d) => d.type === 'parentLinkNode') || [];

	parentLinkNodes.forEach((parentLinkNode) => {
		const { source, target } = parentLinkNode.parentLink!;
		let x = defNum(source.x) - defNum(target.x);
		let y = defNum(source.y) - defNum(target.y);
		const shouldSwapSourceAndTarget = parentNode.id === source.id;
		if (shouldSwapSourceAndTarget) {
			x *= -1;
			y *= -1;
		}
		const [fx, fy] = pointAlongLine(x, y, parentNode.r || 1);
		parentLinkNode.fx = fx;
		parentLinkNode.fy = fy;
	});
}

export function pointAlongLine(x: number, y: number, length: number) {
	const angle = Math.atan2(x, y);
	const x2 = Math.sin(angle) * length;
	const y2 = Math.cos(angle) * length;
	return [x2, y2];
}

export function shortenLine(
	sourceX: number,
	sourceY: number,
	targetX: number,
	targetY: number,
	length: number = 1,
	toOrBy: 'to' | 'by' = 'by'
): WithShortLine['shortLink'] {
	const x = targetX - sourceX;
	const y = targetY - sourceY;
	const radius = toOrBy === 'to' ? length : Math.hypot(x, y) - length;
	const [shortX, shortY] = pointAlongLine(x, y, radius);
	return {
		source: {
			x: sourceX,
			y: sourceY,
		},
		target: {
			x: sourceX + shortX,
			y: sourceY + shortY,
		},
	};
}

export const circleArea = (radius: number) => Math.PI * radius * radius;

export const circleRadius = (area: number) => Math.sqrt(area / Math.PI);

export const translateCenter = ({
	d,
	zk = 1,
	rk = 1,
	zx = 0,
	zy = 0,
	tx = 0,
	ty = 0,
}: {
	d: HierarchicalGraphNode;
	rk?: number;
	zk?: number;
	zx?: number;
	zy?: number;
	tx?: number;
	ty?: number;
}) => `translate(${defNum(d.x) * rk * zk + zx + tx}, ${defNum(d.y) * rk * zk + zy + ty})`;

export const isInteractionFocus = (d: InteractionState) =>
	d.previewedFocus || d.selectedFocus || d.selectedParent || d.previewedParent || false;

export const isInteractionRelated = (d: InteractionState) => d.selected || d.previewed || isInteractionFocus(d);

export const isInteractionSelected = (d: InteractionState) =>
	d.selected || d.selectedFocus || d.selectedParent || false;

export const isInteractionPreviewed = (d: InteractionState) =>
	d.previewed || d.previewedFocus || d.previewedParent || false;

const interactionPriority = (a: NodeOrLink) => {
	if (isInteractionPreviewed(a)) return 3;
	if (isInteractionSelected(a)) return 2;
	if (a.data instanceof HierarchicalGraphNodeDatum) return 1;
	return 0;
};

export const interactionSort = (a: NodeOrLink, b: NodeOrLink) => {
	return interactionPriority(a) - interactionPriority(b);
};

export const updateClassName: ValueFn<Element | BaseType, HierarchicalGraphNode, void> = (datum, i, groups) => {
	const element = groups[i] as Element;
	if (datum.data.removeClassName) element?.classList?.remove(datum.data.removeClassName);
	if (datum.data.className) element?.classList?.add(datum.data.className);
};

export const assignId = (datum: HierarchicalGraphNode | HierarchicalGraphLink) => {
	return datum.type !== 'parentLinkNode' ? datum.data.id : null;
};

const assignIdLabelSuffix = '-label';

export const assignIdLabel = (datum: HierarchicalGraphNode | HierarchicalGraphLink) => {
	return assignId(datum) + assignIdLabelSuffix;
};

export function round(number: number, decimals = 0) {
	decimals = Math.pow(10, decimals);
	return Math.round(number * decimals) / decimals;
}

export const xmlns = 'http://www.w3.org/2000/svg';
export const createSvgElement = (tagName: keyof SVGElementTagNameMap) => document.createElementNS(xmlns, tagName);

export const classNames = {
	// Root //
	graphRoot: 'graphRoot',
	isZooming: 'isZooming',
	// isDragging: 'isDragging', // TODO

	transformWrapper: 'transformWrapper',

	// Graph Types (Nested) //
	superGraph: 'superGraph',
	groupGraph: 'groupGraph',
	subGraph: 'subGraph',

	// Node Types //
	superNode: 'superNode',
	groupNode: 'groupNode',
	subNode: 'subNode',

	// Network Types //
	serverNode: 'serverNode',
	computerNode: 'computerNode',
	softwareNode: 'softwareNode',

	// Label Types //
	superNodeCountLabel: 'superNodeCountLabel',
	superNodeNameLabel: 'superNodeNameLabel',
	subNodeNameLabel: 'subNodeNameLabel',
	occludedLabel: 'occludedLabel',

	// Simulation Nodes & Links //
	keyNode: 'keyNode',
	siblingLink: 'siblingLink',
	parentLinkNode: 'parentLinkNode',
	parentLink: 'parentLink',

	// Interaction State //
	previewed: 'previewed',
	previewedFocus: 'previewedFocus',
	previewedParent: 'previewedParent',
	selected: 'selected',
	selectedFocus: 'selectedFocus',
	selectedParent: 'selectedParent',

	// Time State //
	future: 'future',
	present: 'present',
	past: 'past',
};
