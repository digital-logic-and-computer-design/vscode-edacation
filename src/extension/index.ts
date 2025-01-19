import * as vscode from 'vscode';

import * as node from '../common/node-modules.js';

// import * as commands from './commands/index.js';
// import * as editors from './editors/index.js';
import {Projects} from './projects/index.js';
import {YosysEditor} from './editors/yosys.js';

let projects: Projects | undefined;

export const activate = async (context: vscode.ExtensionContext) => {
   projects = new Projects(context);
        context.subscriptions.push(
            vscode.window.registerCustomEditorProvider(YosysEditor.getViewType(), new YosysEditor(context, projects), {
                webviewOptions: {retainContextWhenHidden: true}
            })
        );

    await projects.load();

    // Managed tool update checker
    const doUpdateCheck = vscode.workspace.getConfiguration('edacation').get('checkToolUpdatesOnStartup') as boolean;
    if (doUpdateCheck && node.isAvailable()) {
        try {
            await vscode.commands.executeCommand('edacation.checkToolUpdates');
        } catch (err) {
            console.trace(err);
        }
    }
};

export const deactivate = () => {
    if (projects) {
        projects.dispose();
    }
};
