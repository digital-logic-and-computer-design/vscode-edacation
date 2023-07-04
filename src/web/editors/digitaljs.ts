import * as vscode from 'vscode';
import {getWebviewUri} from '../util';

import {BaseEditor} from './base';

import { Buffer } from 'buffer';

export class DigitalJSEditor extends BaseEditor {

    public static getViewType() {
        return 'edacation.digitaljs';
    }

    protected getStylePaths() {
        return [
            ['views', 'digitaljs', 'dist', 'assets', 'index.css']
        ];
    }

    protected getScriptPaths() {
        return [
            ['views', 'digitaljs', 'dist', 'assets', 'index.js']
        ];
    }

    protected getHtmlStyles(webview: vscode.Webview): string {
        const styles = super.getHtmlStyles(webview);

        const fontUri = getWebviewUri(webview, this.context, ['views', 'digitaljs', 'dist', 'assets', 'codicon.ttf']);

        return `
            ${styles}
            <style>
                @font-face {
                    font-family: "codicon";
                    font-display: block;
                    src: url("${fontUri}") format("truetype");
                }
            </style>
        `;
    }

    protected onDidReceiveMessage(document: vscode.TextDocument, webview: vscode.Webview, message: any): void {
        if (message.type === 'ready') {
            webview.postMessage({
                type: 'document',
                document: document.getText()
            });
        }
        else if (message.type === 'requestSave') {
            // TODO: figure out better way to save relative to project root
            let rootPath = vscode.workspace.workspaceFolders?.[0].uri || vscode.Uri.file('.');
            let path = vscode.Uri.joinPath(rootPath, message.data?.defaultPath || "");

            vscode.window.showSaveDialog({
                'defaultUri': path,
                'filters': message.data?.saveFilters
            }).then(fileUri => {
                if (!fileUri){
                    return;
                }

                let buf = Buffer.from(message.data.fileContents, 'utf8');
                return vscode.workspace.fs.writeFile(fileUri, buf);
            });
        }
    }

    protected onSave(_document: vscode.TextDocument, _webview: vscode.Webview): void {
        
    }

    protected update(document: vscode.TextDocument, webview: vscode.Webview, isDocumentChange: boolean) {
        if (!isDocumentChange) {
            vscode.commands.executeCommand('edacation-projects.focus');
        }

        webview.postMessage({
            type: 'document',
            document: document.getText()
        });
    }
}
