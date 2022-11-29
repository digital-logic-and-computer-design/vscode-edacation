import * as vscode from 'vscode';

import {ProjectEditor} from '../editors';
import {Project} from '../projects';
import {NextpnrTaskProvider, YosysTaskProvider} from '../tasks';
import {getFileName} from '../util';
import {CurrentProjectCommand} from './base';

export class OpenProjectConfigurationCommand extends CurrentProjectCommand {

    static getID() {
        return 'edacation.openProjectConfiguration';
    }

    async executeForCurrentProject(project: Project) {
        // Open project file
        vscode.commands.executeCommand('vscode.openWith', project.getUri(), ProjectEditor.getViewType());
    }
}

abstract class RunTaskCommand extends CurrentProjectCommand {

    abstract getTaskFilter(): vscode.TaskFilter;

    async executeForCurrentProject(project: Project) {
        // TODO: improve task matching
        // TODO: EDA projects should support relative URI's and use them by default

        const filename = getFileName(project.getUri());

        const tasks = await vscode.tasks.fetchTasks(this.getTaskFilter());
        const task = tasks.find((task) => task.definition.project === filename);

        if (task) {
            vscode.tasks.executeTask(task);
        }
    }
}

export class RunYosysCommand extends RunTaskCommand {

    static getID() {
        return 'edacation.runYosys';
    }

    getTaskFilter() {
        return {
            type: YosysTaskProvider.getType()
        };
    }
}

export class RunNextpnrCommand extends RunTaskCommand {

    static getID() {
        return 'edacation.runNextpnr';
    }

    getTaskFilter() {
        return {
            type: NextpnrTaskProvider.getType()
        };
    }
}