# Setup

Clone Repo

`npm install`
`webpack`  (???)

# Running

Hit the play button to run the extension in a new tab.



# Significant modules in use

"digitaljs": "github:EDAcation/digitaljs#next",
"edacation": "^0.3.6",
"nextpnr-viewer": "^0.6.1",
"yosys2digitaljs": "^0.8.0"

# Using local node

In the local (dev) project to use:
`npm link`
In user (vs code): `npm link edacation`  (or other name)

# Edacation command not found

Update permissions to make it executable (in local build):
`chmod 755 /Users/bsiever/Desktop/Projects/ice40/edacation/dist/cli/index.js`


`npm link` in edacation created a symlink in /opt/homebrew/lib/node_modules to the edacation dev stuff. 

Need to disable the official extension to dev locally. 



## Show RTL

1. Runs Yosys
   ```
    ./mux2.sv
    out/TestProject/default/temp/design.ys:
        read_verilog -sv ./mux2.sv
        hierarchy -auto-top;
        proc;
        opt;
        memory -nomap;
        wreduce -memx;
        opt -full;
        tee -q -o out/TestProject/default/stats.yosys.json stat -json -width *;
        write_json out/TestProject/default/rtl.yosys.json;
    ```
2. Creates `stats.yosys.json` (viewable with internal module level viewer) and `rtl.yosys.json` (viewable w/ internal viewer --- digital JS) and `yosys.log`
3. Uses internal DigitalJS version (includes export to SVG and simulator, but not timing) on the `rtl.yosys.json`.  Can interact with I/O, but no sense of timing diagram.

## Synthesize using Yosys

1. Runs Yosys
   ```
    ./mux2.sv
    out/TestProject/default/temp/design.ys:
        read_verilog -sv ./mux2.sv
        proc;
        opt;
        write_json out/TestProject/default/presynth.yosys.json;
   ```
2. Generates `presynth.yosys.json`, `yosys.log`, `ice40.json`, and `luts.yosys.json`.  Attempts to view `luts.yosys.json`, but error. 

## Place and Route using Nextpnr
 Needs synthesis first to get ARCH.json (ice40.json)!

 nextpnr-ice40 --up5k --package sg48 --asc ice40.asc --json out/TestProject/default/ice40.json --placed-svg out/TestProject/default/placed.svg --routed-svg out/TestProject/default/routed.svg --write out/TestProject/default/routed.nextpnr.json

TODO: This is where the pcf is needed. 


# Internals

## Actions menu call edacation actions:

```
        return 'edacation.runRTL'; / RTLTaskProvider
        return 'edacation.runYosys'; / YosysTaskProvider
        return 'edacation.runNextpnr'; / NextpnrTaskProvider
```


# Viewers in VSCode

src/views/*/src/viewers/...

package.json includes mappings from filename patterns to extensions:

*.yosys.json -> edacation.yosys
*.nextpnr.json -> edacation.nextpnr



# Updates to edacation 

In edacation: 
`npm run build`
`npm link`

in vscode-edacation:
`npm link edacation`

May need to stop VS code and relaunch. 

# Debugging

Running / Debugging "Web Host" works...normal does not??? ok now.


src/extension/index.ts
    activate() registers YosysEditor
              editors/yosys.ts 
                update(document, webview, isDocumentChanged) method called when activated
                    posts new content (as text) to webview object
                        webview is inherited from BasedEditor, which extends a BaseWebview<EditorWebviewArgs>
                                            (editors/base.ts)           (extension/webview.ts)
                                    protected readonly projects: Projects; (BaseEditor)
                                    protected readonly context: vscode.ExtensionContext;
                        BaseEditor calls update() from a createFileSystemwatcher callback (change, create, delete)
                            passes in document, webview, and "true"
                                    const webview = webviewPanel.webview;
        WebviewPanel comes from resolveCustomTextEditor's webview (vscode.WebviewPanel). 
        It has an html from BaseWebview's getHtmlForWebview(). Styles and script are provided by YosysEditor overrides.  Scripts path is dist/views/yosys/index.js 



    src/views/yosys/src/main.ts 
        handleMessage gets the new document and calls
            updateState updates the "state" in the View class to merge in the updates 
            and calls renderDocument(false).  renderDocument calls findViewer and calls it's render(false). 

    src/views/yosys/src/viewers/stats/index.ts
        Stats viewer. It's "render" is called.  


StatsViewer extends BaseViewer<YosysStats>
    BaseViewer has a View object (src/views/yosys/src/main.ts), view, which contains the state (the one that's updated)


OK...Updating StatsViewer's render() to regenerate internals based on this.data
BaseView added new "setData"