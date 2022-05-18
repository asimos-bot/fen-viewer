import { CommentThreadCollapsibleState, Position, TextDocument } from "vscode";
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
    public castling: string;
    public enpassant: Option<[number, number]>;
    constructor(pieces: Array<Array<Option<Piece>>>, castling: string, enpassant: Option<[number, number]>) {
        this.pieces = pieces;
        this.castling = castling;
        this.enpassant = enpassant;
    }
}

export class FenViewer {

    private tileSize: number;
    private rgba: [number, number, number, number];
    private background: Option<ArrayBuffer>;
    private castlingMarker: Option<ArrayBuffer>;
    private enpassantTile: Option<ArrayBuffer>;
    private lightTile: Option<ArrayBuffer>;
    constructor(tileSize: number, rgba: [number, number, number, number]) {
        this.rgba = rgba;
        this.tileSize = tileSize;
        this.background = null;
        this.castlingMarker = null;
        this.enpassantTile = null;
        this.lightTile = null;
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

    private async getBoardEnPassantPngBuffer() {

        if(issome(this.enpassantTile)) {
            return this.enpassantTile;
        }
        let enpassantTile = await sharp({
            create: {
                width: this.tileSize,
                height: this.tileSize,
                channels: 4,
                background: {
                    r: 255,
                    g: 64,
                    b: 64,
                    alpha: 1
                }
            }
        }).png().toBuffer();
        this.enpassantTile = enpassantTile;
        return enpassantTile;
    }

    private async getBoardCastlingMarkerPngBuffer() {
        if(issome(this.castlingMarker)) {
            return this.castlingMarker;
        }

        let castlingMarker = await sharp({
            create: {
                width: Math.round(this.tileSize/4),
                height: Math.round(this.tileSize/4),
                channels: 4,
                background: {
                    r: 255,
                    g: 213,
                    b: 0,
                    alpha: 1
                }
            }
        }).png().toBuffer();
        this.castlingMarker = castlingMarker;
        return castlingMarker;
    }

    private async getBoardLightTilePngBuffer() {
        if(issome(this.lightTile)) {
            return this.lightTile;
        }

        let lightTile = await sharp({
            create: {
                width: this.tileSize,
                height: this.tileSize,
                channels: 4,
                background: {
                    r: this.rgba[0]/2,
                    g: this.rgba[1]/2,
                    b: this.rgba[2]/2,
                    alpha: 0.5
                }
            }
        }).png().toBuffer();
        this.lightTile = lightTile
        return lightTile;
    }
    private async getBoardBackgroundPngBuffer() {
        if(issome(this.background)) {
            return this.background;
        }
        let background = await sharp({
            create: {
                width: this.tileSize * 8,
                height: this.tileSize * 8,
                channels: 4,
                background: {
                    r: this.rgba[0],
                    g: this.rgba[1],
                    b: this.rgba[2],
                    alpha: 1
                }
            }
        }).png().toBuffer();


        let lightTiles = [];
        for(let i = 0; i < 8; i++) {
            for(let j = (i & 1); j < 8; j+=2) {
                lightTiles.push({
                        input: new Uint8Array(await this.getBoardLightTilePngBuffer()),
                        top: i * this.tileSize,
                        left: j * this.tileSize
                    })
            }
        }
        this.background = await sharp(background)
            .composite(lightTiles)
            .png()
            .toBuffer();
        return this.background;
    }

    private async boardBackground(enpassant: Option<[number, number]>, castling: string) {

        let compositions = [];
        if(issome(enpassant)) {
            compositions.push({
                input: await this.getBoardEnPassantPngBuffer(),
                top: enpassant[0] * this.tileSize,
                left: enpassant[1] * this.tileSize
            })
        }
        // castling
        if(castling.includes("q")) {
            compositions.push({
                input: await this.getBoardCastlingMarkerPngBuffer(),
                top: 0,
                left: 0
            })
        }
        if(castling.includes("k")) {
            compositions.push({
                input: await this.getBoardCastlingMarkerPngBuffer(),
                top: 0,
                left: 7 * this.tileSize
            })
        }
        if(castling.includes("Q")) {
            compositions.push({
                input: await this.getBoardCastlingMarkerPngBuffer(),
                top: 7 * this.tileSize,
                left: 0
            })
        }
        if(castling.includes("K")) {
            compositions.push({
                input: await this.getBoardCastlingMarkerPngBuffer(),
                top: 7 * this.tileSize,
                left: 7 * this.tileSize
            })
        }
        return await sharp(await this.getBoardBackgroundPngBuffer())
            .composite(compositions)
            .png()
            .toBuffer();
    }

    public async getCompositeArgument(pieces: Array<any>, piece: Option<Piece>, i: number, j: number) {
        if(issome(piece)) {
            pieces.push({
                input: await piece.getPngBuffer(),
                top: i * this.tileSize,
                left: j * this.tileSize
            })
        }
    }

    public async populateBoard(board: Board) {
        let background = await this.boardBackground(board.enpassant, board.castling);
        let pieces : Array<any> = [];
        for(let i = 0; i < 8; i++) {
            for(let j = 0; j < 8; j++) {
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
        if(!(attrs[2] == "-" || attrs[2].length == 2)) {
            return new Error("invalid enpassant");
        }
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

        let enpassant : Option<[number, number]> = null;
        if(attrs[2] != "-") {
            enpassant = [0, 0];
            enpassant[1] = parseInt(attrs[2][0], 36) - 10;
            enpassant[0] = parseInt(attrs[2][1])-1;
        }
        return new Board(board, attrs[1], enpassant);
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