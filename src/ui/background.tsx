import React from "react";
import {Box, measureElement, Text} from "ink";

interface Props {
    color: string
}

interface State {
    width: number
}

export class Background extends React.Component<Props, State> {
    private readonly myRef: React.RefObject<unknown>;

    constructor(props: Props) {
        super(props);
        this.myRef = React.createRef();
        this.state = {
            width: 0
        }
        process.stdout.on('resize', () => {
            this.#measure();
        })
    }

    #measure() {
        let width: number = 0;
        if (this.myRef.current) {
            // @ts-ignore
            const size = measureElement(this.myRef.current);
            width = size.width; // todo: height is not measured properly
        }
        this.setState({
            width: width
        })
    }

    render() {
        // @ts-ignore
        return <Box ref={this.myRef}>
            <Box>
                <Text backgroundColor={this.props.color}>{" ".repeat(this.state.width)}</Text>
            </Box>
            <Box position={"absolute"}>
                {this.props.children}
            </Box>
        </Box>;
    }

    componentDidMount() {
        this.#measure();
    }

}
