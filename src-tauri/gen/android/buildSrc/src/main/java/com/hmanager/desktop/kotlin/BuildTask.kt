import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction
import javax.inject.Inject
import org.gradle.process.ExecOperations

abstract class BuildTask : DefaultTask() {
    @get:Inject
    abstract val execOperations: ExecOperations

    @Input
    var rootDirRel: String? = null
    @Input
    var projectDir: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val targetName = target ?: "aarch64"
        val isRelease = release ?: false
        val profile = if (isRelease) "release" else "debug"
        val abi = when (targetName) {
            "aarch64" -> "arm64-v8a"
            "x86_64" -> "x86_64"
            "armv7" -> "armeabi-v7a"
            "i686" -> "x86"
            else -> targetName
        }
        val targetTriple = when (targetName) {
            "aarch64" -> "aarch64-linux-android"
            "x86_64" -> "x86_64-linux-android"
            "armv7" -> "armv7-linux-androideabi"
            "i686" -> "i686-linux-android"
            else -> targetName
        }

        val rootDir = File(projectDir ?: ".", rootDirRel ?: "../../../")
        val soSrc = File(rootDir, "target/$targetTriple/$profile/libapp_lib.so")
        val jniDestDir = File(projectDir ?: ".", "src/main/jniLibs/$abi")
        jniDestDir.mkdirs()
        val soDest = File(jniDestDir, "libapp_lib.so")

        // Determine if Rust library needs to be built or updated
        var needsBuild = !soSrc.exists()
        if (!needsBuild) {
            val soTime = soSrc.lastModified()
            val checkList = listOf(
                File(rootDir, "../public"),
                File(rootDir, "src"),
                File(rootDir, "tauri.conf.json"),
                File(rootDir, "Cargo.toml")
            )
            for (item in checkList) {
                if (item.isFile && item.lastModified() > soTime) {
                    needsBuild = true
                    break
                } else if (item.isDirectory) {
                    val newerFile = item.walkTopDown().firstOrNull { it.isFile && it.lastModified() > soTime }
                    if (newerFile != null) {
                        needsBuild = true
                        break
                    }
                }
            }
        }

        if (needsBuild) {
            println("[TauriAndroid] Building fresh native core via cargo for $targetTriple ($profile)...")
            val cargoArgs = mutableListOf(
                "build",
                "--manifest-path", File(rootDir, "Cargo.toml").absolutePath,
                "--target", targetTriple,
                "-j", "4"
            )
            if (isRelease) {
                cargoArgs.add("--release")
            }
            cargoArgs.addAll(listOf("--features", "tauri/custom-protocol"))

            val cargoExe = if (Os.isFamily(Os.FAMILY_WINDOWS)) "cargo.exe" else "cargo"
            execOperations.exec {
                workingDir(rootDir)
                executable(cargoExe)
                args(cargoArgs)
            }.assertNormalExitValue()
        }

        if (soSrc.exists()) {
            println("[TauriAndroid] Copying $soSrc (${soSrc.length()} bytes) to $soDest...")
            soSrc.copyTo(soDest, overwrite = true)
        }

        if (!soDest.exists() || soDest.length() == 0L) {
            throw GradleException("Compiled native library not found at: ${soDest.absolutePath}")
        } else {
            println("[TauriAndroid] Native library ready at: ${soDest.absolutePath} (${soDest.length()} bytes)")
        }

        // Ensure tauri.conf.json is copied to assets
        val tauriConfSrc = File(rootDir, "tauri.conf.json")
        val assetsDir = File(projectDir ?: ".", "src/main/assets")
        assetsDir.mkdirs()
        if (tauriConfSrc.exists()) {
            tauriConfSrc.copyTo(File(assetsDir, "tauri.conf.json"), overwrite = true)
        }

        // Synchronize android icons from src-tauri/icons/android to app/src/main/res
        val iconsSrcDir = File(rootDir, "icons/android")
        val resDir = File(projectDir ?: ".", "src/main/res")
        if (iconsSrcDir.exists()) {
            iconsSrcDir.copyRecursively(resDir, overwrite = true)
        }
    }
}
