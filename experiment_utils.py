from sparse_preprocess import load_facebook100_data, split_preprocessed_data

TOP_NODE_COUNT = 1500
DATASET_FILE = "American75.mat"
DATASET_FOLDER = "facebook100"
SUBSET_SIZES = [250,500, 750]#,1000]#, 1250, 1500]


def load_top_1500_graph(attribute_type="gender", granularity=2):
    """Build the shared 1500-node graph used by the paper experiments.

    This function loads the Facebook100 graph, keeps the highest-degree nodes,
    and returns the ordered node list, edges, and attribute values for the
    selected attribute setup.

    Use the attribute_type argument to choose the experiment setup, for example:
    - "gender"
    - "year"
    - "multidim_gender_year"
    """
    # The friendship graph stays the same across experiments. Only the
    # attribute filter and the node labels change depending on the experiment.
    nodes, _, combined_data = load_facebook100_data(
        mat_filename=DATASET_FILE,
        folder_name=DATASET_FOLDER,
        max_nodes=TOP_NODE_COUNT,
        attribute_type=attribute_type,
        granularity=granularity,
    )
    edges, node_attributes = split_preprocessed_data(nodes, combined_data)

    # Keep one deterministic ordering so every larger sub-dataset contains all
    # nodes from the preceding smaller sub-dataset.
    degree = {node: 0 for node in nodes}
    for first_node, second_node in edges:
        degree[first_node] += 1
        degree[second_node] += 1
    ordered_nodes = sorted(nodes, key=lambda node: degree[node], reverse=True)

    return ordered_nodes, edges, node_attributes
