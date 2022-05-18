// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { FenViewer, PieceType, PieceColor, ok } from './fen-viewer';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// build game board tile
	let fenViewer = new FenViewer(25, [24, 240, 128, 255]);

	let chess_hover = vscode.languages.registerHoverProvider('*', {

		async provideHover(document, position) {

			let boardPieces = fenViewer.strToBoard(document, position);
			if(ok(boardPieces)) {
				let filledBoard = await fenViewer.populateBoard(boardPieces);

				return new vscode.Hover(new vscode.MarkdownString(`![](data:image/png;base64,${filledBoard})`));
			} else {

				return null;
			}
		}	
	});

	context.subscriptions.push(chess_hover);
}

// this method is called when your extension is deactivated
export function deactivate() {}