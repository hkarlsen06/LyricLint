import Root from './sheet.svelte';
import Close from './sheet-close.svelte';
import Content, { type SheetSide } from './sheet-content.svelte';
import Header from './sheet-header.svelte';
import Title from './sheet-title.svelte';
import Trigger from './sheet-trigger.svelte';

export {
	Root,
	Close,
	Content,
	Header,
	Title,
	Trigger,
	type SheetSide,
	//
	Root as Sheet,
	Close as SheetClose,
	Content as SheetContent,
	Header as SheetHeader,
	Title as SheetTitle,
	Trigger as SheetTrigger
};
