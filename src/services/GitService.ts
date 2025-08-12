import * as vscode from 'vscode';
import { GitInfo } from '../utils/types';

export class GitService {
	public static async getRepository(): Promise<GitInfo> {
		const gitExtension = vscode.extensions.getExtension('vscode.git');
		if (!gitExtension) {
			throw new Error('Git extension not found. Please ensure Git is enabled in VS Code.');
		}

		const git = gitExtension.isActive ?
			gitExtension.exports.getAPI(1) :
			(await gitExtension.activate()).getAPI(1);

		if (!git?.repositories?.length) {
			throw new Error('No Git repositories found in the workspace.');
		}

		const repository = git.repositories[0];
		const repoRoot = repository.rootUri.fsPath;
		return { repository, repoRoot };
	}
}
