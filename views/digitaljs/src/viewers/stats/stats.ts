import type {View} from '../../main';
import type {ForeignViewMessage} from '../../messages';
import type {YosysStats} from '../../types';
import {BaseViewer} from '../base';

import {ModuleExplorerGrid, ModuleOverviewGrid} from './elements';
import {type Module, type ModuleStatId, buildModuleTree} from './modules';

interface GridColumnSettings {
    columns: ModuleStatId[];
}

export class StatsViewer extends BaseViewer<YosysStats> {
    handleForeignViewMessage(message: ForeignViewMessage): void {
        if (message.type === 'moduleFocus') {
            // Focus explorer navigator according to breadcrumbs from djs viewer
            this.moduleExplorer.navigateSplice(1);
            for (const moduleName of message.breadcrumbs) {
                const module = this.getModule(moduleName);
                if (!module) {
                    throw new Error(`Unknown module: ${moduleName}`);
                }
                this.moduleExplorer.navigate(module);
            }

            this.moduleExplorer.update();
        }
    }

    private modules: Module[];

    private moduleOverview: ModuleOverviewGrid;
    private moduleExplorer: ModuleExplorerGrid;

    constructor(mainView: View, initData: YosysStats) {
        super(mainView, initData);

        this.modules = buildModuleTree(this.data.modules);
        if (!this.modules) {
            throw new Error('No circuit modules found to display!');
        }

        this.moduleOverview = new ModuleOverviewGrid(this.modules);
        this.moduleOverview.addEventListener('gridHeadersUpdate', (data) => {
            this.storeValue('yosys-stats-overview-settings', {columns: data.newHeaders});
        });
        this.getValue('yosys-stats-overview-settings').then((value) => {
            const settings = Object.keys(value).length ? (value as GridColumnSettings) : {columns: []};
            for (const col of settings.columns) {
                this.moduleOverview.addCol(col);
            }
        });

        this.moduleExplorer = new ModuleExplorerGrid(this.modules[0]);
        this.moduleExplorer.addEventListener('gridHeadersUpdate', (data) => {
            this.storeValue('yosys-stats-explorer-settings', {columns: data.newHeaders});
        });
        this.getValue('yosys-stats-explorer-settings').then((value) => {
            const settings = Object.keys(value).length ? (value as GridColumnSettings) : {columns: []};
            for (const col of settings.columns) {
                this.moduleExplorer.addCol(col);
            }
        });
    }

    private getModule(name: string): Module | null {
        for (const module of this.modules) {
            if (module.name === name) {
                return module;
            }
        }
        return null;
    }

    async render(isUpdate: boolean): Promise<void> {
        if (isUpdate) {
            // All elements are dynamically resized so we don't need to redraw
            return;
        }
        this.root.replaceChildren();

        // ** Overview Table **
        const overviewHeader = document.createElement('h2');
        overviewHeader.textContent = 'Circuit overview';
        this.root.appendChild(overviewHeader);

        this.moduleOverview.render();
        this.root.appendChild(this.moduleOverview.element);

        // ** Divider **
        this.root.appendChild(document.createElement('br'));
        this.root.appendChild(document.createElement('vscode-divider'));

        // ** Circuit explorer **
        const explorerHeader = document.createElement('h2');
        explorerHeader.textContent = 'Circuit explorer';
        this.root.appendChild(explorerHeader);

        this.moduleExplorer.render();
        this.root.appendChild(this.moduleExplorer.element);
    }
}
