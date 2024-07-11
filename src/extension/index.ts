import * as vscode from 'vscode';
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
};

export const deactivate = () => {
    if (projects) {
        projects.dispose();
    }
};
