import { mount } from 'svelte';
import '../../../src/styles/crm.css';
import Harness from './Harness.svelte';
import { mountCanvasFixture } from './canvasFixture';
import { publicFixturePage } from './data';

// The parent resolver targets this origin. Serve a schematic, labeled frame
// only when the normal preview query is present, preventing recursive mounts.
if (new URLSearchParams(location.search).get('crmPreview') === '1') {
  mountCanvasFixture(publicFixturePage);
} else {
  mount(Harness, { target: document.getElementById('app') });
}
