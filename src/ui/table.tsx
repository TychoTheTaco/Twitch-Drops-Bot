import React from "react";
import {Box, Text} from "ink";
import {sha1} from "object-hash";

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

interface TableProps {
    header?: { [key: string]: string } | string[],
    data: { [key: string]: any }[]
    padding: number
    title: string,
    divider: string,
    placeholder: { [key: string]: string } | string
}

interface RowProps {
    color?: string,
    bold?: boolean
}

export class Table extends React.Component<TableProps, any> {

    static defaultProps = {
        padding: 1,
        title: undefined,
        divider: '|',
        placeholder: '-'
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
        const columns = [[...header]];
        for (const item of this.props.data) {
            const column: any[] = [];
            for (const key of header) {
                column.push(item[key] ? item[key].toString() : this.#getPlaceholder(key));
            }
            columns.push(column);
        }
        const widths = this.#getColumnWidths(columns);

        return <Box flexDirection={"column"}>

            {this.props.title &&
                <Text bold color={"blue"}>{this.props.title}</Text>
            }

            {
                // Header
                columns.slice(0, 1).map((item: any) => {
                    return this.#createRow(item, widths, {bold: true});
                })
            }

            {
                // Data
                columns.slice(1).map((item: any) => {
                    return this.#createRow(item, widths, {bold: false});
                })
            }

        </Box>;
    }

    #getColumnWidths(data: string[][]) {
        const widths: number[] = [];
        const columnCount = this.#getKeys(this.props.data).size;
        for (let i = 0; i < columnCount; ++i) {
            let maxWidth = 0;
            for (let j = 0; j < data.length; ++j) {
                maxWidth = Math.max(maxWidth, data[j][i].length);
            }
            widths.push(maxWidth);
        }
        return widths;
    }

    #createRow(data: any[], widths?: number[], rp?: RowProps) {
        const key = `row-${sha1(data)}`;
        const paddingCharacter: string = " ";
        const paddingString = paddingCharacter.repeat(this.props.padding);
        const columns = [...data].map((item: any, index: number) => {
            const spaces = widths ? Math.max(0, widths[index] - item.length) : 0;
            return <Text>
                {paddingString}
                <Text color={rp?.color} bold={rp?.bold}>{item + " ".repeat(spaces)}</Text>
                {paddingString}
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
