import * as vscode from 'vscode';

import * as node from '../../common/node-modules.js';

interface Platform {
    os: 'windows' | 'linux' | 'darwin';
    arch: 'x64' | 'arm64';
}

interface GithubAsset {
    name: string;
    state: 'uploaded' | 'open';
    size: number;
    updated_at: string;
    browser_download_url: string;
}

interface GithubRelease {
    assets: GithubAsset[];
}

interface ToolSettings {
    version: string;
    entrypoint: string;
}

type ToolsState = Record<string, ToolSettings>;

const GLOBAL_STATE_KEY = 'managedTools';
const TOOL_SUBDIR = 'managedTools';
const SUGGESTED_TOOLS = ['yosys', 'nextpnr-ecp5', 'nextpnr-ice40'];

const downloadTool = async (
    url: string,
    extractPath: string,
    onProgress?: (progress: number | null) => void,
    onExtractFile?: (path: string) => void
): Promise<void> => {
    const resp = await fetch(url);
    if (resp.status !== 200) throw new Error(`Unexpected HTTP status code: ${resp.status}`);
    if (!resp.body) throw new Error(`No data in response body!`);

    const contentLength = Number.parseInt(resp.headers.get('content-length') || '') || 0;
    const fetchReader = resp.body.getReader();

    // Create dl - gunzip - untar pipeline
    const buffer = new (node.stream().PassThrough)();
    const gunzipStream = buffer.pipe(node.zlib().createGunzip());
    const unpackStream = gunzipStream.pipe(
        node.tar().extract(extractPath, {
            map(header) {
                if (header.type === 'file' && onExtractFile) onExtractFile(header.name);
                return header;
            }
        })
    );

    if (onProgress) onProgress(null);

    // Read download in chunks
    let downloadedSize = 0;
    while (true) {
        const chunk = await fetchReader.read();
        if (chunk.done) {
            buffer.end();
            break;
        }

        downloadedSize += chunk.value.byteLength;
        buffer.write(chunk.value);

        // Only update progress if we can give an indication
        if (onProgress && contentLength) {
            onProgress(downloadedSize / contentLength);
        }
    }

    // Wait until installation is done (or errors out)
    await new Promise((resolve, reject) => {
        unpackStream.on('finish', resolve);

        buffer.on('error', reject);
        gunzipStream.on('error', reject);
        unpackStream.on('error', reject);
    });

    // Finally, update progress handler, just to be sure
    if (onProgress) onProgress(1);
};

export class ManagedTool {
    private static SUPPORTED_PLATFORMS: Platform[] = [
        {os: 'windows', arch: 'x64'},
        {os: 'linux', arch: 'x64'},
        {os: 'linux', arch: 'arm64'},
        {os: 'darwin', arch: 'x64'},
        {os: 'darwin', arch: 'arm64'}
    ];
    private static SOURCE_REPO = 'https://api.github.com/repos/YosysHQ/oss-cad-suite-build';

    private static platformCache: Platform | null = null;
    private static assetsCache: GithubAsset[] | null = null;

    constructor(
        private extensionContext: vscode.ExtensionContext,
        private tool: string
    ) {}

    getName(): string {
        return this.tool;
    }

    private async getToolsDir(): Promise<vscode.Uri> {
        const dir = vscode.Uri.joinPath(this.extensionContext.globalStorageUri, TOOL_SUBDIR);
        await vscode.workspace.fs.createDirectory(dir);
        return dir;
    }

    private async getDir(): Promise<vscode.Uri> {
        return vscode.Uri.joinPath(await this.getToolsDir(), this.tool);
    }

    private async getToolsState(): Promise<ToolsState> {
        return getToolsState(this.extensionContext);
    }

    private async setToolsState(state: ToolsState) {
        return setToolsState(this.extensionContext, state);
    }

    private async getSettings(): Promise<ToolSettings | null> {
        const state = await this.getToolsState();
        return state[this.tool] ?? null;
    }

    private async setSettings(settings: ToolSettings) {
        const state = await this.getToolsState();
        state[this.tool] = settings;
        await this.setToolsState(state);
    }

    private async delSettings() {
        const state = await this.getToolsState();
        delete state[this.tool];
        await this.setToolsState(state);
    }

    private static async getPlatform(): Promise<Platform> {
        if (ManagedTool.platformCache) return ManagedTool.platformCache;

        // get OS ('win32' -> 'windows' for correct bucket name)
        const nodePlatform = node.os().platform();
        const os = nodePlatform === 'win32' ? 'windows' : nodePlatform;

        const arch = node.os().arch();

        const platform = ManagedTool.SUPPORTED_PLATFORMS.find((plat) => plat.os == os && plat.arch == arch);
        if (!platform) throw new Error(`Platform not supported: ${os}-${arch}`);

        return platform;
    }

    private async getAsset(): Promise<GithubAsset> {
        const platform = await ManagedTool.getPlatform();
        const assets = await ManagedTool.getLatestToolVersions();

        const asset = assets.find((asset) => asset.name === `${platform.os}-${platform.arch}-${this.tool}.tgz`);
        if (!asset) throw new Error(`Could not find tool: ${this.tool} for ${platform.os}-${platform.arch}`);
        return asset;
    }

    static async getLatestToolVersions(refresh = false): Promise<GithubAsset[]> {
        if (!refresh && ManagedTool.assetsCache) return ManagedTool.assetsCache;

        const platform = await ManagedTool.getPlatform();
        const url = `${ManagedTool.SOURCE_REPO}/releases/tags/bucket-${platform.os}-${platform.arch}`;
        const release = await fetch(url)
            .then((resp): Promise<GithubRelease> => {
                if (!resp.ok) throw new Error(`GitHub returned status code: ${resp.status} (${resp.statusText})`);
                return resp.json();
            })
            .catch((err) => {
                console.warn(`Release bucket fetch failed: ${err}`);
                return null;
            });
        if (!release) return [];

        const assets = release.assets.filter((asset) => asset.state == 'uploaded');
        ManagedTool.assetsCache = assets;
        return assets;
    }

    async getInstalledVersion(): Promise<string | null> {
        return (await this.getSettings())?.version ?? null;
    }

    async getLatestVersion(): Promise<string | null> {
        return (await this.getAsset()).updated_at;
    }

    async isUpdateAvailable(): Promise<boolean> {
        const curVersion = await this.getInstalledVersion();
        if (!curVersion) return false; // Something is broken?

        const latestVersion = await this.getLatestVersion();

        // Update available if version strings are not equal
        return curVersion !== latestVersion;
    }

    async isInstalled(): Promise<boolean> {
        return (await this.getEntrypoint()) != null;
    }

    async install(onProgress?: (progress: number | null) => void) {
        // Find correct tool asset and target dirs
        const asset = await this.getAsset();
        const targetDir = await this.getDir();

        const entrypointNames = [this.tool, `${this.tool}.exe`];
        let entrypoint: string | undefined;

        await downloadTool(asset.browser_download_url, targetDir.fsPath, onProgress, (filePath) => {
            const fileName = filePath.split('/').at(-1) ?? '';
            if (entrypointNames.includes(fileName)) entrypoint = filePath;
        });

        if (!entrypoint) {
            throw new Error(`Could not find tool entrypoint!`);
        }
        console.log(`Using entrypoint for ${this.tool}: ${entrypoint}`);

        // Update tool registry
        await this.setSettings({
            version: asset.updated_at,
            entrypoint: entrypoint
        });
    }

    async uninstall() {
        await this.delSettings();

        const toolDir = await this.getDir();
        await vscode.workspace.fs.delete(toolDir, {recursive: true, useTrash: false});
    }

    async getEntrypoint(): Promise<string | null> {
        const settings = await this.getSettings();
        if (!settings) return null;

        const entrypoint = vscode.Uri.joinPath(await this.getDir(), settings.entrypoint);
        try {
            await vscode.workspace.fs.stat(entrypoint);
        } catch {
            // File does not exist
            return null;
        }

        return entrypoint.fsPath;
    }
}

const getToolsState = async (extensionContext: vscode.ExtensionContext): Promise<ToolsState> => {
    const state = (await extensionContext.globalState.get(GLOBAL_STATE_KEY)) as ToolsState;
    return state ?? {};
};

const setToolsState = async (extensionContext: vscode.ExtensionContext, state: ToolsState): Promise<void> => {
    await extensionContext.globalState.update(GLOBAL_STATE_KEY, state);
};

export const getInstalledTools = async (extensionContext: vscode.ExtensionContext): Promise<ManagedTool[]> => {
    const state = await getToolsState(extensionContext);
    return Object.keys(state).map((id) => new ManagedTool(extensionContext, id));
};

export const getSuggestedTools = async (extenstionContext: vscode.ExtensionContext): Promise<ManagedTool[]> => {
    return SUGGESTED_TOOLS.map((id) => new ManagedTool(extenstionContext, id));
};
