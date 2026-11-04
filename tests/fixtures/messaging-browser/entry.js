import { mount } from 'svelte';
import '@fontsource-variable/roboto';
import '../../../src/styles/crm.css';
import Harness from './Harness.svelte';
mount(Harness, { target: document.getElementById('app') });
