import React from "react";
import {Box} from "ink";

interface State {
    rows: number,
    columns: number
}

export class FullScreenBox extends React.Component<any, State> {

    constructor(props: any) {
        super(props);
        const getState = () => {
            return {
                rows: process.stdout.rows,
                columns: process.stdout.columns
            };
        }
        this.state = getState();
        process.stdout.on('resize', () => {
            this.setState(getState());
        })
    }

    render() {
        return <Box flexDirection={"column"} borderStyle="round" height={this.state.rows - 1} width={this.state.columns}>
            {this.props.children}
        </Box>
    }

}
