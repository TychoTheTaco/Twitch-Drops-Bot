import React from "react";
import {Box, Text} from "ink";
import stringWidth from "string-width";
import { v4 as uuidv4 } from 'uuid';

function join(items: Array<any>, separator: any) {
    const result: any[] = [];
    for (let i = 0; i < items.length; ++i) {
        result.push(items[i]);
        if (i !== items.length - 1) {
            result.push(separator);
        }
    }
    return result;
}

interface Props {
    header?: { [key: string]: string } | string[],
    data: { [key: string]: any }[]
    padding: number
    title: string,
    divider: string,
    placeholder: { [key: string]: string } | string,
    placeholderRowCount: number
}

interface RowProps {
    color?: string,
    bold?: boolean
}

export class Table extends React.Component<Props, any> {

    static defaultProps = {
        padding: 1,
        title: undefined,
        divider: '|',
        placeholder: '-',
        placeholderRowCount: 1
    };

    #getPlaceholder(key: string) {
        if (typeof this.props.placeholder === 'string') {
            return this.props.placeholder;
        }
        return this.props.placeholder[key];
    }

    render() {
        let header: string[] = [];
        if (this.props.header) {
            if (Array.isArray(this.props.header)) {
                header = this.props.header;
            } else {
                // assume object
            }
        } else {
            header = [...this.#getKeys(this.props.data)];
        }

        const makeRow = (data: any) => {
            const row: any[] = [];
            for (const key of header) {
                row.push(data[key] ? data[key].toString() : this.#getPlaceholder(key));
            }
            return row;
        }

        const rows = [[...header]];
        for (const item of this.props.data) {
            rows.push(makeRow(item));
        }

        while (rows.length - 1 < this.props.placeholderRowCount) {
            rows.push(makeRow({}));
        }

        const widths = this.#getColumnWidths(rows);

        return <Box flexDirection={"column"}>

            {this.props.title &&
                <Text bold color={"cyan"}>{this.props.title}</Text>
            }

            {
                // Header
                rows.slice(0, 1).map((item: any) => {
                    return this.#createRow(item, widths, {bold: true});
                })
            }

            {
                // Data
                rows.slice(1).map((item: any) => {
                    return this.#createRow(item, widths, {bold: false});
                })
            }

        </Box>;
    }

    #getColumnWidths(data: string[][]) {
        const widths: number[] = [];
        const columnCount = this.#getKeys(data).size;
        for (let i = 0; i < columnCount; ++i) {
            let maxWidth = 0;
            for (let j = 0; j < data.length; ++j) {
                maxWidth = Math.max(maxWidth, stringWidth(data[j][i]));
            }
            widths.push(maxWidth);
        }
        return widths;
    }

    #createRow(data: string[], widths?: number[], rp?: RowProps) {
        const key = `row-${uuidv4()}`;
        const paddingCharacter: string = " ";
        const paddingString = paddingCharacter.repeat(this.props.padding);
        const columnCount = [...data].length;
        const columns = [...data].map((item: string, index: number) => {
            item = ("" + item).trim();
            const spaces = widths ? Math.max(0, widths[index] - stringWidth(item)) : 0;
            return <Text>
                {index > 0 ? paddingString : undefined}
                <Text color={rp?.color} bold={rp?.bold}>{item + " ".repeat(spaces)}</Text>
                {index < columnCount - 1 ? paddingString : undefined}
            </Text>
        });
        return <Box key={key}>
            {...join(columns, <Text>{this.props.divider}</Text>)}
        </Box>;
    }

    #getKeys(data: any[]) {
        const keys = new Set<string>();
        for (const item of data) {
            const ks = Object.keys(item);
            for (const k of ks) {
                keys.add(k);
            }
        }
        return keys;
    }

}
