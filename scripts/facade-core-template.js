// Bind the explicit entry to the shared default loader context
const Loader = (defaultContext.facade ||= createFacade(defaultContext));
// Start explicit definitions without activating document discovery
class CoreLoader extends Loader {
    // Start explicit registrations without automatic document discovery
    static start() {
        return Loader._start(false);
    }
}
export default CoreLoader;
export { ACLLoadError };
