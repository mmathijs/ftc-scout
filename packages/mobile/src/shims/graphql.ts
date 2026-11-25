// Enough of graphql and graphql-scalars for @ftc-scout/common to build the season descriptors.

class Wrapper {
    constructor(public ofType: unknown) {}
}
export class GraphQLNonNull extends Wrapper {}
export class GraphQLList extends Wrapper {}

class Named {
    name: string;
    constructor(public config: { name: string }) {
        this.name = config.name;
    }
}
export class GraphQLObjectType extends Named {}
export class GraphQLEnumType extends Named {}

const scalar = (name: string) => ({ name });
export const GraphQLBoolean = scalar("Boolean");
export const GraphQLFloat = scalar("Float");
export const GraphQLInt = scalar("Int");
export const GraphQLString = scalar("String");
export const GraphQLDate = scalar("Date");
export const GraphQLDateTime = scalar("DateTime");
