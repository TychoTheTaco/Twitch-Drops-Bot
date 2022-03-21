import React from "react";
import {Box, render, Text} from 'ink';

interface StatusBarProps {
    status: string
}

export class StatusBar extends React.Component<StatusBarProps, any> {

    render() {
        return <Text backgroundColor="red">{this.props.status}</Text>
    }

}
