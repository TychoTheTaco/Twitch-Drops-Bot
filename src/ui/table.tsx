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
    data: any[]
}

export class Table extends React.Component<TableProps, any> {

    render() {
        const header = this.#getKeys(this.props.data);
        const columns = [[...header]];
        for (const item of this.props.data) {
            const column: any[] = [];
            for (const key of header) {
                column.push(item[key].toString());
            }
            columns.push(column);
        }
        const widths = this.#getColumnWidths(columns);

        return <Box flexDirection={"column"} borderStyle={"single"}>

            {
                // Data
                columns.map((item: any) => {
                    const key = `row-${sha1(item)}`;
                    return this.#createRow(item, key, widths);
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

    #createRow(data: any[], key: any = undefined, widths?: number[]) {
        const padding: number = 1;
        const paddingCharacter: string = " ";
        const paddingString = paddingCharacter.repeat(padding);
        const columns = [...data].map((item: any, index: number) => {
            const spaces = widths ? Math.max(0, widths[index] - item.length) : 0;
            return <Text>
                {
                    paddingString + item + " ".repeat(spaces) + paddingString
                }
            </Text>
        });
        return <Box key={key}>
            {...join(columns, <Text>|</Text>)}
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
