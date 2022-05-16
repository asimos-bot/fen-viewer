import { Position, TextDocument } from "vscode";
import * as images from './images';
import { decode, encode } from 'typescript-base64-arraybuffer';

const sharp = require('sharp');

type Result<T> = T | Error;

export const ok = <T>(r: Result<T>): r is T => !(r instanceof Error);

type Option<T> = T | null;

export const issome = <T>(r: Option<T>): r is T => !(r == null);

export const enum PieceColor {
    WHITE = 'w',
    BLACK = 'b'
}

export const enum PieceType {
    KING = 'K',
    QUEEN = 'Q',
    KNIGHT = 'N',
    BISHOP = 'B',
    PAWN = 'P',
    ROOK = 'R'
}

class Piece {
    public type: PieceType;
    public color: PieceColor;
    constructor(type: PieceType, color: PieceColor) {
        this.type = type;
        this.color = color;
    }

    public getPngBuffer() {
        switch(this.type) {

            case PieceType.BISHOP:
                return this.color == PieceColor.WHITE ? images.white_bishop : images.black_bishop;
                break;
            case PieceType.KING:
                return this.color == PieceColor.WHITE ? images.white_king : images.black_king;
                break;
            case PieceType.PAWN:
                return this.color == PieceColor.WHITE ? images.white_pawn : images.black_pawn;
                break;
            case PieceType.KNIGHT:
                return this.color == PieceColor.WHITE ? images.white_knight : images.black_knight;
                break;
            case PieceType.QUEEN:
                return this.color == PieceColor.WHITE ? images.white_queen : images.black_queen;
                break;
            case PieceType.ROOK:
                return this.color == PieceColor.WHITE ? images.white_rook : images.black_rook;
                break;
        }
    }
}

class Board {
    public pieces: Array<Array<Option<Piece>>>;
    private castling: string;
    private enpassant: [number, number];
    constructor(pieces: Array<Array<Option<Piece>>>, castling: string, enpassant: [number, number]) {
        this.pieces = pieces;
        this.castling = castling;
        this.enpassant = enpassant;
    }
}

export class FenViewer {

    private tile_size: number;
    private rgba: [number, number, number, number];
    private boardPng: any;
    constructor(tile_size: number, rgba: [number, number, number, number]) {
        this.rgba = rgba;
        this.tile_size = tile_size;
    }

    public static charToPiece(c: string, color: PieceColor) {
        let type : PieceType = PieceType.BISHOP;
        switch(c) {
            case 'K':
                type = PieceType.KING;
                break;
            case 'Q':
                type = PieceType.QUEEN;
                break;
            case 'N':
                type = PieceType.KNIGHT;
                break;
            case 'B':
                type = PieceType.BISHOP;
                break;
            case 'P':
                type = PieceType.PAWN;
                break;
            case 'R':
                type = PieceType.ROOK;
                break;
            default:
                return null;
                break;
        }
        return new Piece(type, color);
    }

    private async addlightTileComposition(lightTiles: Array<any>, i: number, j: number, newlightTile: any) {

        lightTiles.push({
            input: await newlightTile.png().toBuffer(),
            top: i * this.tile_size,
            left: j * this.tile_size,
            height: this.tile_size,
            width: this.tile_size
        });
    }

    private async boardBackground() {

        let background = await sharp({
            create: {
                width: this.tile_size * 8,
                height: this.tile_size * 8,
                channels: 4,
                background: {
                    r: this.rgba[0],
                    g: this.rgba[1],
                    b: this.rgba[2],
                    alpha: 1
                }
            }
        }).png().toBuffer();

        let lightTile = await sharp({
            create: {
                width: this.tile_size,
                height: this.tile_size,
                channels: 4,
                background: {
                    r: this.rgba[0]/2,
                    g: this.rgba[1]/2,
                    b: this.rgba[2]/2,
                    alpha: 0.5
                }
            }
        }).png().toBuffer();

        let lightTiles = [];
        for(let i = 0; i < 8; i++) {
            for(let j = (i & 1); j < 8; j+=2) {
                lightTiles.push({
                        input: new Uint8Array(lightTile),
                        width: this.tile_size,
                        height: this.tile_size,
                        top: i * this.tile_size,
                        left: j * this.tile_size
                    })
            }
        }
        return await sharp(background)
            .composite(lightTiles)
            .png()
            .toBuffer();
    }

    public async getCompositeArgument(pieces: Array<any>, piece: Option<Piece>, i: number, j: number) {
        if(issome(piece)) {
            pieces.push({
                input: await piece.getPngBuffer(),
                width: this.tile_size,
                height: this.tile_size,
                top: i * this.tile_size,
                left: j * this.tile_size
            })
        }
    }

    public async populateBoard(board: Board) {
        let background = await this.boardBackground();
        let pieces : Array<any> = [];
        for(let i = 0; i < 8; i++) {
            for(let j = 0; j < 8; j++) {
                //this.drawPiece(pngPong, board[i][j], i, j);
                await this.getCompositeArgument(pieces, board.pieces[i][j], i, j);
            }
        }
        return encode(await sharp(background).composite(pieces).png().toBuffer());
    }

    private isUpper(str: String) {
        return str.toUpperCase() == str;
    }

    private parseFen(str: String) : Result<Board> {
        let rows = str.split(/ (.*)/s);
        if (rows.length != 3) return new Error("invalid fen string");
        rows = [rows[0], rows[1]];
        let attrs = rows[1].split(' ');
        rows = rows[0].split('/');
        if (rows.length != 8 || attrs.length != 5) new Error("invalid fen string");

        // create empty matrix
        let board : any = []
        for(let i = 0; i < 8; i++) {
            board.push([])
            for(let j = 0; j < 8; j++) {
                board[i].push( null );
            }
        }
        for(let i = 0; i < rows.length; i++) {
            let j = 0;
            for(let ci = 0; ci < rows[i].length; ci++) {
                let c = rows[i][ci];
                if("PNBRQK".includes(c.toUpperCase())) {
                    let color = PieceColor.BLACK;
                    if( this.isUpper(c) ) {
                        color = PieceColor.WHITE;
                    }
                    let piece = FenViewer.charToPiece(c.toUpperCase(), color);
                    board[i][j] = piece;
                    j++;
                } else if("12345678".includes(c)) {
                    j += Number(c);
                    if(j > 8) return new Error("Invalid row sum");
                } else {
                    return new Error("Invalid FEN string character");
                }
            }
            if(j!=8) return new Error("invalid fen string");
        }
        return new Board(board, attrs[1], [0, 1]);
    }

    private stringCheck(text: string, begin: number, end: number) {

        let escape = false;
        let res = {
            numberQuotes: 0,
            lastQuoteIdx: 0,
            firstQuoteIdx: 0,
        }
        for(let i : number = begin; i < end; i++) {
            if(escape) {
                escape = false;
                continue;
            }
            if(text[i] == '\\') {
                escape = true
            } else if(text[i] == '"') {
                res.lastQuoteIdx = i;
                if(res.numberQuotes == 0) res.firstQuoteIdx = i;
                res.numberQuotes++;
            }
        }
        return res;
    }

    private getHoveredString(line: string, first: number, position: number): Result<string> {
        // check if we are inside string (must have an odd number of valid " before position)
        let res = this.stringCheck(line, first, position);
        // if it is even, nothing happens (we are not inside a string)
        if(!(res.numberQuotes & 1)) {
            return new Error("not inside string");
        }
        // if we reach here, it is odd, and we are inside a string
        // check where the string ends
        let beginStr = res.lastQuoteIdx+1;
        res = this.stringCheck(line, position, line.length);
        // we won't accept multine strings here!
        if(!res.firstQuoteIdx) {
            return new Error("not inside string");
        }
        let endStr = res.firstQuoteIdx;
        return line.substring(beginStr, endStr);
    }

    public strToBoard(document: TextDocument, position: Position): Result<Board> {
        const _line = document.lineAt(position);
        const first = _line.firstNonWhitespaceCharacterIndex;
        const line = _line.text;
        let str = this.getHoveredString(line, first, position.character);
        if(ok(str)) {
            return this.parseFen(str);
        }
        return new Error("couldn't get board");
    }
}